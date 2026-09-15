# 07 — Ports in practice

Real snippets: how each port is implemented and consumed. Two are runnable files with self-checks; the rest
are call-site examples. The runnable files live under [`docs/reference/`](../reference/), mirroring the proposed
[module layout](./README.md#suggested-module-layout); snippet imports use the project's `@/` path alias.

← back to [README](./README.md) · interfaces: [01](./01-ports.md)

---

## AgentProvider — `ReplayProvider` (runnable)

The reference implementation and the zero-spend test double. Full file:
[`replay-provider.ts`](../reference/adapters/agent/replay/replay-provider.ts).

```ts
import { ReplayProvider } from '@/adapters/agent/replay/replay-provider';

const provider = new ReplayProvider({
  events: [
    { type: 'system', sessionId: 'abc-123' },
    { type: 'assistant_text', text: 'hello' },
    { type: 'result', usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, numTurns: 2, costUsd: 0.012 }, outcome: 'pass' },
  ],
});

const run = provider.launch({ prompt: { preamble: '', inputs: [], outputs: [], closing: '' }, model: 'default', cwd: '/tmp' });
for await (const ev of run.events) console.log(ev.type);   // system, assistant_text, result
const { usage, outcome } = await run.result;               // { costUsd: 0.012 }, 'pass'
```

Run its self-check: `node docs/reference/adapters/agent/replay/replay-provider.ts`. A real `ClaudeCodeProvider` implements
the *same* three members — `id`, `capabilities`, `resolveModel`, `launch` — spawning `claude` and parsing
`stream-json` into the identical `NormalizedEvent` stream. The consumer above does not change.

## TaskSource — `MarkdownTaskSource` (runnable)

Full file: [`markdown-source.ts`](../reference/adapters/source/markdown/markdown-source.ts).

```ts
import { MarkdownTaskSource } from '@/adapters/source/markdown/markdown-source';

const source = new MarkdownTaskSource();
const tasks = await source.fetch({ content: '## Backlog\n- **Filter list by status** — add a dropdown' });
// [{ import_key: 'filter-list-by-status', title: 'Filter list by status', body: undefined }]

// idempotent upsert — re-import twice = 0 created, N updated (the whole acceptance test)
for (const t of tasks) {
  db.insert(schema.tasks)
    .values({ projectId, importKey: t.import_key, title: t.title, body: t.body, /* … */ })
    .onConflictDoUpdate({ target: [schema.tasks.projectId, schema.tasks.importKey], set: { title: t.title, body: t.body } });
}
```

Run its self-check: `node docs/reference/adapters/source/markdown/markdown-source.ts`. Both file shapes and key stability
are asserted there.

## Notifier — `ConsoleNotifier` + escalation call site

A trivial `link_only` adapter shows the shape; the Slack adapter swaps the body for Block Kit and adds
signature verification, nothing else.

```ts
import type { Notifier, PostedRef, QuestionContext } from '@/core/ports/notifier';
import type { Question } from '@/core/hitl/question';

export class ConsoleNotifier implements Notifier {
  readonly id = 'console';
  readonly capabilities = new Set(['link_only'] as const);

  async postQuestion(q: Question, ctx: QuestionContext): Promise<PostedRef> {
    console.log(`[${ctx.taskTitle} · ${ctx.stepName}] ${q.prompt}  →  ${ctx.sessionUrl ?? '/inbox'}`);
    return { channel: 'stdout', ref: q.id };
  }
  async updateResolved(ref: PostedRef, by: string) {
    console.log(`[resolved by ${by}] ${ref.ref}`);
  }
}
```

The escalation job (component 10) depends only on the port — the channel is injected:

```ts
async function escalate(notifier: Notifier, q: Question, ctx: QuestionContext) {
  if (await isAnswered(q.id)) return;                 // skip if already answered
  const posted = await notifier.postQuestion(q, ctx); // Slack | Discord | Console | …
  await saveRef(q.id, posted);                        // slack_channel + slack_ts equivalent
}
// on web answer OR channel answer, the SAME idempotent path repaints the other side:
async function onAnswered(notifier: Notifier, q: Question, by: string) {
  const ref = await loadRef(q.id);
  if (ref) await notifier.updateResolved(ref, by);
}
```

## Workspace — git worktree adapter

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Workspace, WorkspaceHandle, TaskRef } from '@/core/ports/workspace';
const run = promisify(execFile);

export function worktreeWorkspace(repoPath: string): Workspace {
  const dir = (id: string) => `${repoPath}/.vibe-worktrees/task-${id}`;
  return {
    id: 'worktree',
    async create(task: TaskRef): Promise<WorkspaceHandle> {
      const path = dir(task.id);
      const branch = `vibe/task-${task.id}`;
      await run('git', ['-C', repoPath, 'worktree', 'add', path, '-b', branch]);
      return { path, branch };
    },
    cwd: (task) => dir(task.id),
    execHost: (task) => hostExecHost(dir(task.id)),  // container tier returns a docker ExecHost instead
    async destroy(task, opts) {
      const args = ['-C', repoPath, 'worktree', 'remove', ...(opts?.force ? ['--force'] : []), dir(task.id)];
      await run('git', args);
    },
  };
}
```

A `containerWorkspace` adapter implements the same interface against a devcontainer/sandbox; its `execHost`
returns a container `ExecHost` that applies the security profile (egress allowlist, non-root, caps, limits —
[08](./08-sandboxing.md)). It removes the shared-worktree collision (PRD §11) and needs no engine change.

## ArtifactStore — disk adapter (scan by mtime)

```ts
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactStore, FileMeta, TaskRef } from '@/core/ports/artifact-store';

// files are named NN-<type>.<ext>, e.g. 01-research_brief.md
const typeOf = (name: string) => name.replace(/^\d+-/, '').replace(/\.[^.]+$/, '');

export function diskArtifactStore(worktreeOf: (t: TaskRef) => string): ArtifactStore {
  const dir = (t: TaskRef) => join(worktreeOf(t), '.vibe', `task-${t.id}`);
  return {
    id: 'disk',
    resolve: (t, type) => join(dir(t), `${type}.md`),
    async scan(task, sinceMtimeMs, produces): Promise<FileMeta[]> {
      const base = dir(task);
      const out: FileMeta[] = [];
      for (const name of await readdir(base)) {
        const type = typeOf(name);
        if (!produces.includes(type)) continue;           // only declared outputs
        const s = await stat(join(base, name));
        if (s.mtimeMs >= sinceMtimeMs) out.push({ type, path: join(base, name), bytes: s.size, mtimeMs: s.mtimeMs });
      }
      return out;
    },
    async register() { /* insert a row into `artifacts` (pointer only) */ },
  };
}
```

## Composing them — the runner (illustrative)

The runner touches three ports and no adapter. Engine/db/prompt helpers live elsewhere and are elided.

```ts
import type { AgentProvider } from '@/core/ports/agent-provider';
import type { Workspace } from '@/core/ports/workspace';
import type { ArtifactStore } from '@/core/ports/artifact-store';

export async function runStep(
  deps: { provider: AgentProvider; workspace: Workspace; store: ArtifactStore },
  step: StepDef, task: TaskRef, produces: string[],
) {
  const startedAt = Date.now();

  const run = deps.provider.launch({                       // AgentProvider port
    prompt: buildPrompt(step, task, deps.store),           //   (paths via store.resolve)
    model: step.model, effort: step.effort,
    cwd: deps.workspace.cwd(task),                         // Workspace port
    resume: step.resume,
  });

  for await (const ev of run.events) {                     // normalized — provider-blind
    persistEvent(run, ev);                                 //   → run_events + SSE
    if (ev.type === 'result') updateLiveCost(task, ev.usage);
  }

  const result = await run.result;                         // AgentProvider port
  const files = await deps.store.scan(task, startedAt, produces); // ArtifactStore port
  for (const f of files) await deps.store.register({ taskId: task.id, type: f.type, path: f.path, bytes: f.bytes });

  return { result, files };                                // → engine applies §8 advancement
}
```

Swapping Claude for Codex means constructing a different `provider` in the composition root and nothing here
changes. That invariant *is* the abstraction (see [06 — where a new provider touches the code](./06-cost-and-platform.md#where-a-new-provider-actually-touches-the-codebase)).
