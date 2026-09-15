# 01 — The five ports

The genericization contract. Every sketch is TypeScript-shaped pseudocode; the point is the *shape of the
seam*, not the exact fields. Core code programs against these; adapters implement them.

← back to [README](./README.md)

---

## AgentProvider

The centerpiece. Turns "run an agent" into a normalized contract so Claude Code, Codex, and a test
`ReplayProvider` are interchangeable.

```ts
type Capability =
  | 'effort' | 'sessions' | 'resume_fork' | 'mcp_tools' | 'plugins'
  | 'allowed_tools' | 'permission_modes' | 'native_cost' | 'partial_stream' | 'budget_cap';

interface RunSpec {
  prompt: PromptParts;               // normalized 6-part prompt (PRD §7)
  model: string;                     // logical id; adapter resolves to native
  effort?: Effort;                   // low|medium|high|xhigh|max (dropped if unsupported)
  toolPolicy?: { allow?: string[]; deny?: string[] };
  tools?: ToolServer[];              // MCP servers / injected tools (ask_user)
  capabilities?: CapabilityPack[];   // skills / plugins to mount
  cwd: string;                       // Workspace path
  resume?: { sessionId: string; fork?: boolean };
  limits?: { maxTurns?: number; maxBudgetUsd?: number };
}

interface AgentRun {
  sessionId: Promise<string>;
  pid: number;
  events: AsyncIterable<NormalizedEvent>;
  result: Promise<RunResult>;
  stop(): void;
}

interface RunResult { usage: Usage; exitCode: number; outcome?: 'pass' | 'fail'; error?: string; }

interface AgentProvider {
  id: 'claude-code' | 'codex' | 'replay';
  capabilities: Set<Capability>;
  resolveModel(logical: string): string;    // 'reasoning-high' -> 'opus' | 'o3'
  launch(spec: RunSpec): AgentRun;
}
```

### The normalized event envelope

The universal seam — already half-present in `run_events.type`. Each adapter parses its native stream
(`stream-json` for Claude; Codex's own event format) into exactly these seven kinds. The viewer, cost
ledger, and engine never see provider JSON.

```ts
type NormalizedEvent =
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; summary: string }
  | { type: 'tool_result'; ok: boolean; output: unknown }
  | { type: 'system'; sessionId?: string }
  | { type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }
  | { type: 'error'; message: string };

interface Usage {
  input: number; output: number; cacheRead: number; cacheWrite: number;
  numTurns: number; costUsd?: number;   // absent -> PricingService fills it (06)
}
```

Persist the raw line alongside the normalized event (the schema already has `run_events.raw`) so a new
provider's parser can be debugged against real captures without re-spending.

### Capability negotiation

The key trick that makes graceful degradation cheap. The engine and flow editor query `capabilities`
before using a knob:

- no `effort` → adapter drops it; editor greys the field.
- no `resume_fork` → park/resume falls back to **context-replay** (re-inject requires/produces + answers
  into a fresh prompt — which the spec already does anyway).
- no `mcp_tools` → HITL uses the artifact-file fallback ([04](./04-hitl-and-notify.md#9-human-in-the-loop-protocol)).
- no `native_cost` → PricingService computes cost from tokens.
- no `allowed_tools` → tool policy becomes advisory / prompt-level.

Validation (component 2) checks steps against the *target provider's* capability set, so
"step uses effort but its provider lacks it" is a design-time warning, same machinery as the artifact contract.

### Logical model ids

Step defs reference logical ids (`reasoning-high`, `fast-cheap`, `default`) resolved per provider via
`resolveModel`. A flow authored for Claude runs on Codex unchanged; only the resolution table differs.

### ReplayProvider

Promote the backlog's fake-`claude` test harness to a first-class adapter: `launch()` replays a recorded
`NormalizedEvent` stream (or a captured `stream-sample.jsonl`) with scripted timing. Every engine, park/resume,
and cost test runs deterministic and zero-spend.

### Validating the port

The interface is only as good as its second implementation. Before hardening, spike the **Codex adapter**
against three risk points: (a) session/resume semantics vs Claude's `--resume --fork-session`; (b) cost —
Codex reports tokens, not dollars, so `native_cost` is absent and PricingService is on the critical path;
(c) MCP tool exposure — confirm `ask_user` can be injected, else the artifact-file HITL fallback is mandatory,
not optional.

---

## Notifier

Abstracts escalation away from Slack Block Kit. A channel advertises how richly it can collect an answer.

```ts
interface Notifier {
  id: 'slack' | 'discord' | 'email' | 'webhook';
  capabilities: Set<'inline_answer' | 'link_only'>;
  postQuestion(q: Question): Promise<{ channel: string; ref: string }>;  // ref = slack_ts equiv
  updateResolved(ref: string, by: string): Promise<void>;                // chat.update equiv
}
```

`inline_answer` channels render native controls (Slack blocks, Discord components); `link_only` channels
(email) send a deep link to `/inbox`. Reconciliation — idempotent first-write-wins, repaint on
answer/undo — is channel-independent; only rendering and signature verification differ per adapter.

---

## Workspace

Per-task isolation. Git worktree today; a container/microVM adapter adds a security boundary (see
[ExecHost](#exechost-and-sandboxing) and [08 — sandboxing](./08-sandboxing.md)) and fixes the spec's own
shared-worktree collision constraint (PRD §11). The Workspace also hands out the
[ExecHost](#exechost-and-sandboxing) that decides *where* a process runs against it.

```ts
type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';

interface Workspace {
  id: 'worktree' | 'container' | 'microvm' | 'remote';
  create(task: TaskRef): Promise<{ path: string; branch?: string }>;
  cwd(task: TaskRef): string;
  execHost(task: TaskRef): ExecHost;    // host child_process, or inside the sandbox
  destroy(task: TaskRef, opts: { force?: boolean }): Promise<void>;  // explicit only (PRD §11)
}
```

---

## ExecHost and sandboxing

*Where* a process runs, decoupled from *which* agent runs it. An AgentProvider builds an argv; the ExecHost
decides where it executes — host `child_process`, a hardened container, or a microVM. This keeps sandboxing
orthogonal to the provider: **any provider × any tier, for free** (2×N, not N×M). The runner gets it from
`workspace.execHost(task)` and passes it in `RunSpec.exec`; the provider adapter spawns through it instead of
importing `child_process`.

```ts
interface SandboxProfile {
  tier: IsolationTier;
  image?: string;
  egressAllow: string[];   // default-deny; allow model endpoint + registries + git remote. [] = offline
  limits?: { memoryMb?: number; cpus?: number; pids?: number; wallClockMs?: number };
  mounts?: Array<{ source: string; target: string; readOnly?: boolean }>;  // never host secrets / docker.sock
  env?: Record<string, string>;   // run-scoped; never bake secrets into the image
  nonRoot?: boolean;              // default true; bypassPermissions requires it
}

interface ExecHost {
  id: IsolationTier;
  profile?: SandboxProfile;       // absent for the host tier
  spawn(command: string, args: string[], opts: { cwd: string; env?: Record<string, string> }): ChildHandle;
}
```

**The gate:** the runner refuses `permission_mode='bypassPermissions'` unless the tier is a sandbox
(`container`/`gvisor`/`microvm`). Egress restriction is the load-bearing control — it holds even when
tool-approval is bypassed. Full threat model, isolation ladder, and prior art: [08 — sandboxing](./08-sandboxing.md).

---

## ArtifactStore

Files the agent reads/writes; the DB stores only pointers (PRD §6). Disk+git by default; a remote adapter
enables multi-machine later. Contract validation (component 2) is store-agnostic — it checks *type-graph
reachability*, not bytes.

```ts
interface ArtifactStore {
  scan(task: TaskRef, sinceMtime: number): Promise<FileMeta[]>;   // matched to `produces`
  resolve(task: TaskRef, type: string): string;                   // absolute path for the prompt
  register(meta: ArtifactMeta): Promise<void>;
}
```

---

## TaskSource

Ingestion. Markdown import today; the `backlog-importer` agent is the "messy file" adapter. All adapters
normalize through one **server-derived** `import_key` (`frontmatter.id` → else `slugify(title)`) — never
trust an agent-derived key (the backlog's duplicate-import root cause).

```ts
interface TaskSource {
  id: 'markdown' | 'github' | 'linear' | 'webhook';
  fetch(input: SourceInput): Promise<Array<{ import_key: string; title: string; body?: string }>>;
}
```

Idempotent upsert on `(project_id, import_key)`: re-import twice = 0 created, N updated.
