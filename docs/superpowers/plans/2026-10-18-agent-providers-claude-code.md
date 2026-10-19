# Agent Providers (Claude Code first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `AgentProvider` port, a replay test double, a host `ExecHost`, and a Claude Code provider built on `@anthropic-ai/claude-agent-sdk` that drives the locally installed `claude` CLI with the owner's subscription login.

**Architecture:** Two workspace packages inside `code/flowboard`. `@flowboard/core` holds the port types and two provider-neutral helpers (prompt rendering, guard rules) and has no runtime dependencies. `@flowboard/adapters` holds the host exec, the replay provider and the Claude provider. The Claude provider is three units: `options.ts` maps `RunSpec` to SDK `Options` (pure), `normalize.ts` maps `SDKMessage` to `NormalizedEvent` (pure, stateful per run), and `provider.ts` wires them to `query()`, spawning the CLI through `RunSpec.exec`.

**Tech Stack:** TypeScript 5.9 run directly by Node 24 type stripping (no build step), `node:test`, pnpm 10 workspaces, `@anthropic-ai/claude-agent-sdk` 0.3.302.

**Spec:** `docs/FlowBoard/Agent Providers/` — chiefly `AgentProvider Port.md`, `Run Spec.md`, `Agent Run Handle And Result.md`, `Normalized Event Envelope.md`, `Provider Capabilities.md`, `Claude Code Adapter.md`, `Stream Parsing And Normalization.md`, `Provider SDK Fit Analysis.md`. Reference code: `docs/old/reference/core/ports/*.ts`, `docs/old/reference/adapters/agent/replay/replay-provider.ts`. Recorded stream: `docs/old/stream-sample.jsonl`. Guard rules: `docs/FlowBoard/Execution/Run Guardrails At Launch.md`. Prompt order: `docs/FlowBoard/Execution/Prompt Assembly.md`.

## Global Constraints

- Work on branch `feature/agent-providers-claude`, branched from `dev`.
- All commands run from `code/flowboard/` unless stated.
- Node 24, no build step: only erasable TypeScript (no `enum`, no parameter properties, no `namespace`); type-only imports use `import type`; relative imports carry the `.ts` extension.
- `@flowboard/core` has **no** `dependencies` and never imports `@flowboard/adapters` (the dependency rule in `Provider Boundary Rules.md`).
- Tests use `node:test` and `node:assert/strict` only. No test framework.
- Pin `@anthropic-ai/claude-agent-sdk` to exactly `0.3.302`. It bundles CLI `2.1.302`; the installed CLI at `/opt/homebrew/bin/claude` is `2.1.302`.
- Auth: the provider runs the installed `claude` binary with the owner's login. Never pass `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` into a run; never set `CLAUDE_CONFIG_DIR`.
- Isolation from personal config: `settingSources: []`, `strictMcpConfig: true`, env `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- Provider id is `'claude-code'`. Logical model ids are Claude aliases and `resolveModel` is the identity (Capability Library Decisions D20).
- Out of scope: the runner, the job queue, persistence of `run_events`, the permission gate, the ask-user MCP shim, the docker `ExecHost`, the OpenCode provider (a follow-up plan).

## Port decisions this plan makes

These settle Agent Providers Open Questions; Task 7 records them in the docs.

| Change to the reference port | Settles |
|---|---|
| `Capability` gains `'tool_hooks'` | #1 |
| `RunSpec` gains `permissionMode?`, `systemPrompt?`, `guards?: GuardRules` | #4 |
| Session id is always read from `system/init`; the adapter does not pass one | #5 |
| `AgentRun.pid` becomes `Promise<number>` (the SDK spawns after `launch()` returns) | — |
| `NormalizedEvent` gains `{ type: 'usage'; usage: Usage }` (running totals) and an optional `raw` on every event | #9, raw-line rule |
| Native lines with no kind (`hook_*`, `status`, `rate_limit_event`, partial text deltas) are dropped | #7 |
| `RunResult.error` set means failed, even when `exitCode` is 0 | #33 |
| `ExecHost.spawn` returns a Node `ChildProcessWithoutNullStreams` (the SDK needs stdin; `ChildHandle` is removed) | — |
| Replay harness = a `NormalizedEvent` script; the Claude normalizer is tested against the recorded JSONL | #20 |

## Review Focus

1. A caller awaits `run.result` without ever reading `run.events` — the result must still settle (the reference replay provider hangs here). Test: Task 6, `settles result without reading events`.
2. A write to `/repo/wt-other/x` or `/repo/wt/../secret` when the worktree is `/repo/wt` — must be denied, not passed by a string-prefix check. Test: Task 2, `denies sibling and traversal paths`.
3. The SDK's `query()` throws after yielding an error result — the run must report the result's own error once, not a generic second error. Test: Task 6, `keeps the result error when query throws after it`.
4. A plugin dir path that does not exist — the CLI skips it silently, so the run would proceed without its skill. Must fail loudly. Test: Task 6, `fails when a requested plugin is not loaded`.
5. The worker's own environment carries `ANTHROPIC_API_KEY` — it would silently switch the run to API billing. Must be stripped. Test: Task 5, `strips API keys and isolates config`.

---

### Task 1: Workspace and the `@flowboard/core` port

**Files:**
- Modify: `code/flowboard/pnpm-workspace.yaml`
- Modify: `code/flowboard/tsconfig.json` (`exclude`)
- Modify: `code/flowboard/package.json` (scripts, `@types/node`)
- Create: `code/flowboard/packages/tsconfig.json`
- Create: `code/flowboard/packages/core/package.json`
- Create: `code/flowboard/packages/core/src/ports/agent-provider.ts`
- Create: `code/flowboard/packages/core/src/ports/events.ts`
- Create: `code/flowboard/packages/core/src/ports/exec-host.ts`
- Create: `code/flowboard/packages/core/src/prompt.ts`
- Create: `code/flowboard/packages/core/src/index.ts`
- Test: `code/flowboard/packages/core/test/prompt.test.ts`

**Interfaces:**
- Produces (all re-exported from `@flowboard/core`):
  - Every type in the three reference port files, with the changes in *Port decisions*.
  - `type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`
  - `interface GuardRules { writeRoots: string[]; denyPaths?: string[]; denyCommands?: string[] }` (in `agent-provider.ts`; doc comments: `writeRoots` absolute dirs writes may land in, `denyPaths` globs relative to `cwd` from the task's non-goals, `denyCommands` regex sources matched against Bash commands)
  - `RunSpec` adds `permissionMode?: PermissionMode; systemPrompt?: string; guards?: GuardRules`
  - `AgentRun.pid: Promise<number>` (doc: resolves once the process is spawned; `-1` if it never was)
  - `NormalizedEvent` = the seven kinds plus `{ type: 'usage'; usage: Usage }`, each intersected with `{ raw?: unknown }`
  - `const ZERO_USAGE: Usage` (all zeros, no `costUsd`) in `events.ts`
  - `ExecHost.spawn(command: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): ChildProcessWithoutNullStreams` (`import type { ChildProcessWithoutNullStreams } from 'node:child_process'`; a plain `ChildProcess` types its streams as nullable, and the SDK's `SpawnedProcess` needs them non-null)
  - `renderPrompt(parts: PromptParts): string` in `prompt.ts`

- [ ] **Step 1: Branch and wire the workspace**

```bash
git switch -c feature/agent-providers-claude
```

`pnpm-workspace.yaml` gains `packages: ['packages/*']` (keep `ignoredBuiltDependencies`). The Next `tsconfig.json` adds `"packages"` to `exclude`. Root `package.json` gains scripts `"test:packages": "node --test \"packages/*/test/*.test.ts\""` and `"typecheck:packages": "tsc -p packages"`, and `@types/node` moves to `^24`.

`packages/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2024", "module": "nodenext", "moduleResolution": "nodenext",
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true, "erasableSyntaxOnly": true, "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["*/src", "*/test"]
}
```

`packages/core/package.json`: `"name": "@flowboard/core"`, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, no dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/test/prompt.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrompt } from '../src/prompt.ts';

test('renders the six parts in canonical order', () => {
  const out = renderPrompt({
    preamble: 'Task: Add login\n\nThe form posts to /api/login.',
    inputs: [{ type: 'research_brief', path: '/w/brief.md' }],
    outputs: [{ type: 'plan', path: '/w/plan.md' }],
    invocation: '/grill-me:grill-me',
    template: 'Focus on auth.',
    closing: 'This is a headless run. Use the ask_user tool for questions.',
  });
  assert.equal(out, [
    'Task: Add login\n\nThe form posts to /api/login.',
    'Read these first:\n- research_brief: /w/brief.md',
    'Write your output to:\n- plan: /w/plan.md',
    '/grill-me:grill-me',
    'Focus on auth.',
    'This is a headless run. Use the ask_user tool for questions.',
  ].join('\n\n'));
});

test('omits empty parts', () => {
  assert.equal(
    renderPrompt({ preamble: 'P', inputs: [], outputs: [], closing: 'C' }),
    'P\n\nC',
  );
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test packages/core/test/prompt.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../src/prompt.ts`.

- [ ] **Step 4: Copy the reference ports and implement `renderPrompt`**

Copy `docs/old/reference/core/ports/{agent-provider,events,exec-host}.ts` into `packages/core/src/ports/`, apply every row of *Port decisions* that touches a type, and add `.ts` to the relative imports. Update the doc comments the changes contradict (`AgentRun.pid`, `RunResult.error`, `ExecHost`). `renderPrompt` joins the non-empty parts with a blank line; list items are `- <type>: <path>`. `src/index.ts` re-exports `./ports/agent-provider.ts`, `./ports/events.ts`, `./ports/exec-host.ts`, `./prompt.ts`.

- [ ] **Step 5: Install, test, typecheck**

Run: `pnpm install && node --test packages/core/test/prompt.test.ts && pnpm typecheck:packages`
Expected: 2 tests pass; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.json package.json pnpm-lock.yaml packages/tsconfig.json packages/core
git commit -m "feat(core): add AgentProvider port and prompt renderer"
```

---

### Task 2: Guard rules

**Files:**
- Create: `code/flowboard/packages/core/src/guard.ts`
- Modify: `code/flowboard/packages/core/src/index.ts` (re-export)
- Test: `code/flowboard/packages/core/test/guard.test.ts`

**Interfaces:**
- Consumes: `GuardRules` (Task 1).
- Produces:
  - `checkToolCall(rules: GuardRules, tool: string, input: unknown, cwd: string): string | undefined` — returns the denial reason, or `undefined` to allow.
  - `DEFAULT_DENY_COMMANDS: string[]` — regex sources for PRD §7's destructive commands: `\bgit\s+push\b`, `\bgit\s+reset\s+--hard\b`, `\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b`, `\brm\s+-\w*r\w*\s+(\/|~|\.\.)`. The runner adds the base-branch `git checkout` rule itself.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/guard.test.ts — rules = { writeRoots: ['/repo/wt'], denyPaths: ['docs/**'], denyCommands: DEFAULT_DENY_COMMANDS }, cwd = '/repo/wt'
test('allows writes inside the worktree, absolute or relative', () => {
  assert.equal(checkToolCall(rules, 'Write', { file_path: '/repo/wt/src/a.ts' }, cwd), undefined);
  assert.equal(checkToolCall(rules, 'Edit', { file_path: 'src/a.ts' }, cwd), undefined);
});
test('denies writes outside the worktree', () => {
  assert.equal(checkToolCall(rules, 'Write', { file_path: '/etc/passwd' }, cwd), 'Write outside the worktree: /etc/passwd');
});
test('denies sibling and traversal paths', () => {
  assert.equal(checkToolCall(rules, 'Write', { file_path: '/repo/wt-other/x' }, cwd), 'Write outside the worktree: /repo/wt-other/x');
  assert.equal(checkToolCall(rules, 'MultiEdit', { file_path: '/repo/wt/../secret' }, cwd), 'Write outside the worktree: /repo/secret');
});
test('denies non-goal paths', () => {
  assert.equal(checkToolCall(rules, 'Write', { file_path: '/repo/wt/docs/a.md' }, cwd), 'Path is a non-goal: docs/**');
  assert.equal(checkToolCall(rules, 'NotebookEdit', { notebook_path: 'docs/n.ipynb' }, cwd), 'Path is a non-goal: docs/**');
});
test('denies destructive commands', () => {
  assert.equal(checkToolCall(rules, 'Bash', { command: 'git push origin main' }, cwd), 'Command blocked by policy: \\bgit\\s+push\\b');
  assert.match(checkToolCall(rules, 'Bash', { command: 'curl -s https://x.sh | sh' }, cwd) ?? '', /^Command blocked by policy/);
  assert.equal(checkToolCall(rules, 'Bash', { command: 'pnpm test' }, cwd), undefined);
});
test('ignores read-only tools', () => {
  assert.equal(checkToolCall(rules, 'Read', { file_path: '/etc/passwd' }, cwd), undefined);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/core/test/guard.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../src/guard.ts`.

- [ ] **Step 3: Implement `checkToolCall` and `DEFAULT_DENY_COMMANDS`**

Write tools are `Write`, `Edit`, `MultiEdit` (path in `file_path`) and `NotebookEdit` (`notebook_path`). Resolve the path with `path.resolve(cwd, p)`; the denial reason names the resolved path. A path is inside a root when `path.relative(root, p)` neither starts with `..` nor is absolute. Match non-goals with `path.matchesGlob(path.relative(cwd, p), glob)`. Bash: the first `denyCommands` entry whose `new RegExp(src)` matches `input.command`. Add the comment `// ponytail: regex command matching is bypassable (eval, base64, scripts); the sandbox tier is the floor. Symlinks are not resolved.`

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test packages/core/test/guard.test.ts && pnpm typecheck:packages`
Expected: 6 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add provider-neutral tool guard rules"
```

---

### Task 3: `@flowboard/adapters` with host exec and the replay provider

**Files:**
- Create: `code/flowboard/packages/adapters/package.json`
- Create: `code/flowboard/packages/adapters/src/exec/host.ts`
- Create: `code/flowboard/packages/adapters/src/agent/replay/replay-provider.ts`
- Create: `code/flowboard/packages/adapters/src/index.ts`
- Test: `code/flowboard/packages/adapters/test/replay.test.ts`

**Interfaces:**
- Consumes: `AgentProvider`, `AgentRun`, `ExecHost`, `NormalizedEvent`, `ZERO_USAGE` from `@flowboard/core`.
- Produces:
  - `hostExecHost: ExecHost` — `id: 'host'`; `spawn` calls `child_process.spawn(command, args, { cwd, env, stdio: 'pipe' })`.
  - `class ReplayProvider implements AgentProvider` with `constructor(script: ReplayScript)` and the reference `ReplayScript`; `pid` resolves to `script.pid ?? -1`.

- [ ] **Step 1: Create the package**

`package.json`: `"name": "@flowboard/adapters"`, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, `"dependencies": { "@flowboard/core": "workspace:*" }`. Run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Port the reference self-check to `test('replays a script')` with the same events and assertions, plus `assert.equal(await run.pid, -1)`. Add:

```ts
test('stop() settles as stopped', async () => {
  const run = new ReplayProvider({ events: [{ type: 'system', sessionId: 's' }, { type: 'assistant_text', text: 'a' }] }).launch(spec);
  for await (const ev of run.events) { if (ev.type === 'system') run.stop(); }
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.error, 'stopped');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test packages/adapters/test/replay.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Port the replay provider and write `hostExecHost`**

Copy the reference replay provider without its self-check block. Import `ZERO_USAGE` from `@flowboard/core` as a value import: this proves Node strips types through the workspace symlink. `src/index.ts` re-exports both modules.

- [ ] **Step 5: Run them to verify they pass**

Run: `node --test packages/adapters/test/replay.test.ts && pnpm typecheck:packages`
Expected: 2 tests pass; `tsc` prints nothing. If Node reports `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, stop and report it: the package layout needs rethinking before Task 4.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters pnpm-lock.yaml
git commit -m "feat(adapters): add host exec and replay provider"
```

---

### Task 4: Claude message normalizer

**Files:**
- Modify: `code/flowboard/packages/adapters/package.json` (SDK dependency)
- Create: `code/flowboard/packages/adapters/src/agent/claude/normalize.ts`
- Create: `code/flowboard/packages/adapters/test/fixtures/claude-hello.jsonl` (copy of `docs/old/stream-sample.jsonl`)
- Test: `code/flowboard/packages/adapters/test/claude-normalize.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent`, `Usage`, `ZERO_USAGE` from `@flowboard/core`; `SDKMessage` type from the SDK.
- Produces:
  - `createNormalizer(): (msg: SDKMessage) => NormalizedEvent[]` — one normalizer per run; every returned event carries `raw: msg`.
  - `summarizeTool(name: string, input: unknown): string` — `Bash: <command>`; `<name> <file_path|notebook_path|pattern|url>` when the field exists; else `<name>`; truncated to 120 characters.

Mapping:

| `SDKMessage` | Events |
|---|---|
| `system` / `init` (first only) | `system { sessionId: session_id }` |
| `stream_event` `message_start` | reset the current message's usage from `event.message.usage`, emit `usage` (finished messages + current) |
| `stream_event` `message_delta` | overwrite the current message's usage with `event.usage` (cumulative per message), emit `usage` |
| `stream_event` `message_stop` | add the current message's usage to the finished total |
| `assistant` | per content block: `text` → `assistant_text`, `thinking` → `thinking` (`block.thinking`), `tool_use` → `tool_use { name, input, summary }`; if `msg.error` is set, also `error { message: 'assistant error: <error>' }` |
| `user` with array content | per `tool_result` block → `tool_result { ok: !is_error, output: content }` |
| `result` | `result { usage }`: token counts summed over `modelUsage` (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`), falling back to `usage` when `modelUsage` is empty; `numTurns: num_turns`; `costUsd: total_cost_usd`. If `is_error`, also `error { message: '<subtype>: <errors joined by "; ">' }` |
| anything else | nothing |

Usage field mapping: `input_tokens` → `input`, `output_tokens` → `output`, `cache_read_input_tokens` → `cacheRead`, `cache_creation_input_tokens` → `cacheWrite`. `numTurns` stays 0 in `usage` events.

- [ ] **Step 1: Add the SDK**

Run: `pnpm --filter @flowboard/adapters add @anthropic-ai/claude-agent-sdk@0.3.302 && pnpm --filter @flowboard/adapters add -D @anthropic-ai/sdk @modelcontextprotocol/sdk zod`
Expected: `package.json` shows `"@anthropic-ai/claude-agent-sdk": "0.3.302"` with no caret. Remove a caret if pnpm adds one.

- [ ] **Step 2: Write the failing tests**

```ts
const lines = readFileSync(new URL('./fixtures/claude-hello.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l) as SDKMessage);

test('normalizes the recorded hello stream', () => {
  const norm = createNormalizer();
  const events = lines.flatMap(norm);
  assert.deepEqual(events.map((e) => e.type), ['system', 'usage', 'assistant_text', 'usage', 'result']);
  assert.ok(events.every((e) => e.raw));
  assert.deepEqual(events[0], { type: 'system', sessionId: 'f16d1674-d449-45b3-a129-112d72e35d53', raw: lines[10] });
  assert.equal((events[2] as { text: string }).text, 'Hello.');
  assert.deepEqual((events[4] as { usage: Usage }).usage,
    { input: 2, output: 6, cacheRead: 10007, cacheWrite: 22797, numTurns: 1, costUsd: 0.45876175 });
});
test('emits system only once', () => { /* push lines[10] twice → one system event */ });
test('resets per-message usage at message_start', () => {
  // msg A: message_start usage {input 10, output 1}, message_delta usage {input 10, output 5}, message_stop
  // msg B: message_start usage {input 20, output 1}, message_delta usage {input 20, output 7}
  // last usage event: input 30, output 12 (not 14)
});
test('maps tool_use and tool_result', () => {
  // assistant content [{type:'tool_use', id:'t1', name:'Bash', input:{command:'pnpm test'}}]
  //   → { type:'tool_use', name:'Bash', input:{command:'pnpm test'}, summary:'Bash: pnpm test' }
  // user content [{type:'tool_result', tool_use_id:'t1', content:'boom', is_error:true}]
  //   → { type:'tool_result', ok:false, output:'boom' }
});
test('maps thinking blocks', () => { /* {type:'thinking', thinking:'hmm'} → { type:'thinking', text:'hmm' } */ });
test('reports an error result', () => {
  // result subtype 'error_max_turns', is_error true, errors ['Reached max turns'], modelUsage {}
  // → types ['result','error'], error message 'error_max_turns: Reached max turns'
});
```

Write the synthetic messages as literal objects cast with `as SDKMessage`, carrying only the fields the normalizer reads.

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test packages/adapters/test/claude-normalize.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `normalize.ts`.

- [ ] **Step 4: Implement `createNormalizer` and `summarizeTool`**

- [ ] **Step 5: Run them to verify they pass**

Run: `node --test packages/adapters/test/claude-normalize.test.ts && pnpm typecheck:packages`
Expected: 6 tests pass; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters pnpm-lock.yaml
git commit -m "feat(adapters): normalize Claude Agent SDK messages"
```

---

### Task 5: `RunSpec` → SDK options

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/claude/options.ts`
- Test: `code/flowboard/packages/adapters/test/claude-options.test.ts`

**Interfaces:**
- Consumes: `RunSpec`, `renderPrompt`, `checkToolCall` from `@flowboard/core`; `Options`, `SpawnOptions`, `SpawnedProcess` types from the SDK.
- Produces: `buildQuery(spec: RunSpec, base: { claudePath: string; env: NodeJS.ProcessEnv; abortController: AbortController; spawnClaudeCodeProcess: (o: SpawnOptions) => SpawnedProcess }): { prompt: string; options: Options }` — `spec.model` is already resolved by the caller.

Mapping (the inferred table in `Claude Code Adapter.md`, rewritten for the SDK):

| Option | Value |
|---|---|
| prompt | `renderPrompt` of the parts without `invocation`; when `invocation` is set, it goes first: `` `${invocation}\n\n${rest}` `` (the CLI only treats a leading `/` as a slash command) |
| `model`, `effort`, `cwd` | from `spec` |
| `pathToClaudeCodeExecutable`, `abortController`, `spawnClaudeCodeProcess` | from `base` |
| `env` | `base.env` without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, plus `CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1'` |
| `settingSources` / `strictMcpConfig` / `includePartialMessages` | `[]` / `true` / `true` |
| `systemPrompt` | always `{ type: 'preset', preset: 'claude_code' }`; adds `append` = `spec.systemPrompt` and every `system_prompt` pack's text joined by `\n\n`, when any exist |
| `permissionMode` | `spec.permissionMode ?? 'dontAsk'`; `allowDangerouslySkipPermissions: true` only for `bypassPermissions` |
| `allowedTools` | when `toolPolicy.allow` is set: allow + `mcp__<name>__*` for each `spec.tools` entry; else absent |
| `disallowedTools` | `toolPolicy.deny` |
| `mcpServers` | each `ToolServer` → `{ type: 'stdio', command, args, env }` keyed by `name` |
| `plugins` | each `plugin_dir` pack → `{ type: 'local', path }`; `native` packs are ignored |
| `resume` / `forkSession` | `spec.resume.sessionId` / `spec.resume.fork ?? false` |
| `maxTurns` / `maxBudgetUsd` | from `spec.limits` |
| `hooks` | when `spec.guards` is set: `{ PreToolUse: [{ hooks: [cb] }] }`. `cb` calls `checkToolCall(spec.guards, input.tool_name, input.tool_input, spec.cwd)` and returns `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }` on a reason, else `{}` |

- [ ] **Step 1: Write the failing tests**

Build one full `RunSpec` fixture (model `'sonnet'`, effort `'high'`, cwd `'/repo/wt'`, `toolPolicy: { allow: ['Read'], deny: ['WebFetch'] }`, `tools: [{ name: 'vibe', command: 'node', args: ['shim.js'] }]`, packs `plugin_dir '/plugins/fbecho'` and `system_prompt 'Be terse.'`, `systemPrompt: 'You are the planner.'`, `resume: { sessionId: 's1', fork: true }`, `limits: { maxTurns: 5, maxBudgetUsd: 2 }`, `guards: { writeRoots: ['/repo/wt'] }`, invocation `'/fbecho:echo'`).

```ts
test('maps a full RunSpec', () => {
  const { options: o } = buildQuery(spec, base);
  assert.equal(o.model, 'sonnet'); assert.equal(o.effort, 'high'); assert.equal(o.cwd, '/repo/wt');
  assert.deepEqual(o.allowedTools, ['Read', 'mcp__vibe__*']);
  assert.deepEqual(o.disallowedTools, ['WebFetch']);
  assert.deepEqual(o.mcpServers, { vibe: { type: 'stdio', command: 'node', args: ['shim.js'], env: undefined } });
  assert.deepEqual(o.plugins, [{ type: 'local', path: '/plugins/fbecho' }]);
  assert.deepEqual(o.systemPrompt, { type: 'preset', preset: 'claude_code', append: 'You are the planner.\n\nBe terse.' });
  assert.equal(o.resume, 's1'); assert.equal(o.forkSession, true);
  assert.equal(o.maxTurns, 5); assert.equal(o.maxBudgetUsd, 2);
});
test('puts the skill invocation first', () => {
  assert.ok(buildQuery(spec, base).prompt.startsWith('/fbecho:echo\n\n'));
});
test('strips API keys and isolates config', () => {
  const { options: o } = buildQuery(spec, { ...base, env: { PATH: '/bin', ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't' } });
  assert.deepEqual(o.env, { PATH: '/bin', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' });
  assert.deepEqual(o.settingSources, []); assert.equal(o.strictMcpConfig, true);
});
test('defaults to dontAsk and only bypass skips permissions', () => {
  // no permissionMode → 'dontAsk', allowDangerouslySkipPermissions falsy
  // permissionMode 'bypassPermissions' → allowDangerouslySkipPermissions true
});
test('leaves allowedTools unset without an allow list', () => { /* toolPolicy undefined → o.allowedTools undefined */ });
test('guard hook denies with a reason', async () => {
  const cb = buildQuery(spec, base).options.hooks!.PreToolUse![0].hooks[0];
  const out = await cb({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '/etc/x' },
    tool_use_id: 't', session_id: 's', transcript_path: '', cwd: '/repo/wt' } as PreToolUseHookInput, 't', { signal: new AbortController().signal });
  assert.deepEqual(out, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: 'Write outside the worktree: /etc/x' } });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/claude-options.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `options.ts`.

- [ ] **Step 3: Implement `buildQuery`**

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test packages/adapters/test/claude-options.test.ts && pnpm typecheck:packages`
Expected: 6 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): map RunSpec to Claude Agent SDK options"
```

---

### Task 6: `ClaudeCodeProvider`

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/claude/provider.ts`
- Modify: `code/flowboard/packages/adapters/src/index.ts` (re-export)
- Test: `code/flowboard/packages/adapters/test/claude-provider.test.ts`

**Interfaces:**
- Consumes: `buildQuery` (Task 5), `createNormalizer` (Task 4), `hostExecHost` (Task 3), port types from `@flowboard/core`, `query` from the SDK.
- Produces:
  - `type QueryFn = (p: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>`
  - `class ClaudeCodeProvider implements AgentProvider` with `constructor(opts?: { claudePath?: string; env?: NodeJS.ProcessEnv; query?: QueryFn })`; defaults are `'claude'`, `process.env` and the SDK's `query`.
  - `id = 'claude-code'`; `capabilities` = all ten reference flags plus `'tool_hooks'`; `resolveModel` is the identity.

`launch(spec)` behaviour:
- Calls `buildQuery({ ...spec, model: this.resolveModel(spec.model) }, …)` and starts an internal pump immediately. The pump drives the query whether or not anyone reads `events`.
- `spawnClaudeCodeProcess(o)` spawns through `spec.exec ?? hostExecHost` with `o.cwd ?? spec.cwd` and `o.env`. It resolves `pid`, keeps the last 4,000 characters of stderr (this listener also drains the pipe), kills the child with `SIGTERM` when `o.signal` aborts, and records the exit code from the child's `'exit'` event (`code ?? 1`).
- `events`: the pump emits each normalized event on an `EventEmitter`; `events` iterates `on(emitter, 'event', { close: ['end'] })`, created inside `launch()` so nothing is lost before the first read.
- `sessionId` resolves on the `system` event. It rejects when the pump ends without one; attach a no-op `.catch` so an unread rejection is not unhandled.
- Plugin check: on `init`, every requested `plugin_dir` whose `path.resolve(path)` is missing from `msg.plugins[].path` produces `error { message: 'plugin not loaded: <path>' }` and aborts the run.
- If the query throws: when an `error` event was already emitted, ignore the throw; otherwise emit `error { message }` with the thrown message.
- `result` settles when the pump ends and the child has exited, with `usage` from the `result` event (else `ZERO_USAGE`), `exitCode` from the child (else `1` if there was an error, `0` if not), and `error` = the first error message, or the stderr tail when `exitCode` is non-zero. After `stop()`: `{ exitCode: 130, error: 'stopped' }`, as the replay provider does.
- `stop()` aborts the `AbortController`.

- [ ] **Step 1: Write the failing tests**

A test helper `fakeQuery(messages: SDKMessage[], opts?: { childScript?: string; throwAfter?: Error; waitForAbort?: boolean }): QueryFn`. It calls `options.spawnClaudeCodeProcess!({ command: process.execPath, args: ['-e', childScript ?? ''], env: process.env, signal: options.abortController!.signal })`, yields the messages, then optionally waits for the abort signal and throws.

```ts
test('runs the recorded stream end to end', async () => {
  const run = new ClaudeCodeProvider({ query: fakeQuery(lines) }).launch(spec);
  const types = []; for await (const ev of run.events) types.push(ev.type);
  assert.deepEqual(types, ['system', 'usage', 'assistant_text', 'usage', 'result']);
  assert.equal(await run.sessionId, 'f16d1674-d449-45b3-a129-112d72e35d53');
  assert.ok((await run.pid) > 0);
  const res = await run.result;
  assert.equal(res.exitCode, 0); assert.equal(res.error, undefined); assert.equal(res.usage.costUsd, 0.45876175);
});
test('settles result without reading events', async () => {
  const res = await new ClaudeCodeProvider({ query: fakeQuery(lines) }).launch(spec).result;
  assert.equal(res.exitCode, 0);
});
test('keeps the result error when query throws after it', async () => {
  // messages: init + result { subtype:'error_max_turns', is_error:true, errors:['Reached max turns'], modelUsage:{} , … }
  // throwAfter: new Error('Claude Code returned an error result')
  // → exactly one 'error' event; res.error === 'error_max_turns: Reached max turns'
});
test('stop() kills the child and settles as stopped', async () => {
  // childScript 'setTimeout(() => {}, 60000)', messages [init], waitForAbort: true
  // read events until 'system', then run.stop()
  // → res.exitCode 130, res.error 'stopped', and the test finishes well under 60 s
});
test('fails when a requested plugin is not loaded', async () => {
  // spec with capabilities [{ id:'p', provider:'claude-code', mount:{ kind:'plugin_dir', path:'/nope' } }], init.plugins []
  // → an error event 'plugin not loaded: /nope'; res.error === 'plugin not loaded: /nope'
});
test('sessionId rejects when the run dies before init', async () => {
  // fakeQuery([], { throwAfter: new Error('spawn failed') })
  // → await assert.rejects(run.sessionId); res.error === 'spawn failed'
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/claude-provider.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `provider.ts`.

- [ ] **Step 3: Implement `ClaudeCodeProvider`**

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:packages && pnpm typecheck:packages`
Expected: every test in both packages passes; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): add ClaudeCodeProvider on the Agent SDK"
```

---

### Task 7: Live check against the installed CLI, and the docs

**Files:**
- Create: `code/flowboard/packages/adapters/test/fixtures/fbecho-plugin/.claude-plugin/plugin.json` (`{ "name": "fbecho", "version": "0.0.1", "description": "FlowBoard test plugin" }`)
- Create: `code/flowboard/packages/adapters/test/fixtures/fbecho-plugin/skills/echo/SKILL.md` (frontmatter `name: echo`, `description: Replies with a fixed token`; body `Reply with exactly: ECHO-OK`)
- Create: `code/flowboard/packages/adapters/test/claude-live.test.ts`
- Modify: `code/flowboard/package.json` (script `"test:live": "FLOWBOARD_LIVE=1 node --test packages/adapters/test/claude-live.test.ts"`)
- Modify: `docs/FlowBoard/Agent Providers/Claude Code Adapter.md`
- Modify: `docs/FlowBoard/Agent Providers/Agent Providers Open Questions.md`

**Interfaces:**
- Consumes: `ClaudeCodeProvider` (Task 6).

These tests spend subscription quota, so each `test` passes `{ skip: !process.env.FLOWBOARD_LIVE }`. Each run uses `cwd` = a fresh `mkdtemp(join(tmpdir(), 'fb-live-'))` and model `'haiku'`.

- [ ] **Step 1: Write the live tests**

```ts
test('hello on the installed CLI with the subscription login', live, async () => {
  // preamble 'Reply with the single word OK.', closing 'Do not use any tools.', limits { maxTurns: 1 }
  // collect events; the system event's raw.apiKeySource === 'none' (subscription, not an API key)
  // sessionId matches /^[0-9a-f-]{36}$/; some assistant_text; res.exitCode 0; res.error undefined;
  // res.usage.output > 0; res.usage.costUsd > 0
});
test('mounts a plugin and runs its skill headless', live, async () => {
  // capabilities [plugin_dir <abs path to fixtures/fbecho-plugin>], prompt.invocation '/fbecho:echo', limits { maxTurns: 2 }
  // → some assistant_text includes 'ECHO-OK'
});
test('guard hook blocks a write outside the worktree under bypassPermissions', live, async () => {
  // target = join(tmpdir(), `fb-guard-${randomUUID()}.txt`) (outside cwd)
  // preamble `Use the Write tool to create ${target} containing hi. Do not use Bash.`
  // permissionMode 'bypassPermissions', guards { writeRoots: [cwd] }, limits { maxTurns: 3 }
  // → existsSync(target) === false; some tool_result with ok === false
});
```

- [ ] **Step 2: Run them**

Run: `pnpm test:live`
Expected: 3 tests pass. If the skill test fails, check the `system` event's `raw.plugins` and `raw.slash_commands` before changing code. A failure here means the slash-first rule or the plugin mount is wrong, and `Claude Code Adapter.md` must record the actual behaviour. Run `pnpm test:packages` and confirm the live tests show as skipped without `FLOWBOARD_LIVE`.

- [ ] **Step 3: Update the docs**

In `Claude Code Adapter.md`, add a section `## Built on the Agent SDK` (2026-10-18) that points to `code/flowboard/packages/adapters/src/agent/claude/` and replaces the inferred flag table with Task 5's mapping table. In `Agent Providers Open Questions.md`, append to #1, #4, #5, #7, #9, #20 and #33 a line `**Decided 2026-10-18** (Claude adapter implementation): <the row from *Port decisions*>.`, keeping the house style of the notes (cited, sentence case, `[[wikilinks]]`).

- [ ] **Step 4: Commit**

```bash
git add packages/adapters package.json "../../docs/FlowBoard/Agent Providers"
git commit -m "test(adapters): live-check the Claude provider; record port decisions"
```

---

## Skipped on purpose

- **CLI/SDK version check at startup.** Both versions are pinned and match today (2.1.302). Add one when the installed CLI auto-updates past the SDK.
- **Snapshotting the argv to `data/runs/<id>/args.json`.** That belongs to the runner; `SpawnOptions` already holds the argv if it is wanted.
- **In-process `ask_user` (`createSdkMcpServer`).** It needs the HITL broker; `RunSpec.tools` keeps the stdio shim path working until then.
- **Structured output for `outcome` (#10).** That is the Execution component's call.
