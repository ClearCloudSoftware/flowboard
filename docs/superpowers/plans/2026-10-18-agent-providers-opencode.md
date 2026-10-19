# OpenCode Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `OpencodeProvider` that implements the `AgentProvider` port by driving a per-run `opencode serve` process through `@opencode-ai/sdk/v2`, so a FlowBoard step can run on a non-Claude model unchanged.

**Architecture:** Each `launch()` starts its own `opencode serve` on `127.0.0.1` through `RunSpec.exec`, with a per-run password, a scratch `XDG_CONFIG_HOME` and the run's whole config injected as `OPENCODE_CONFIG_CONTENT`. The adapter talks to it with the v2 SDK client: create or fork a session, subscribe to `/event`, `promptAsync`, answer every `permission.asked`, and stop at the root session's `session.idle`. Five units, mirroring the Claude adapter: `permissions.ts` and `options.ts` (pure mappings), `normalize.ts` (events → `NormalizedEvent`), `guard-plugin.ts` (an OpenCode plugin enforcing `RunSpec.guards`), and `provider.ts` + `server.ts` (process and HTTP plumbing).

**Tech Stack:** TypeScript on Node 24 type stripping, `node:test`, `@opencode-ai/sdk` 1.19.3 (`/v2` entry), OpenCode CLI 1.19.3.

**Spec:** `docs/FlowBoard/Agent Providers/Provider SDK Fit Analysis.md` (the OpenCode column and *Changes the port needs*), plus the port notes it links (`AgentProvider Port.md`, `Run Spec.md`, `Agent Run Handle And Result.md`, `Normalized Event Envelope.md`, `Provider Capabilities.md`, `Capability Negotiation.md`). The shipped port is `code/flowboard/packages/core/src/`; the Claude adapter in `code/flowboard/packages/adapters/src/agent/claude/` is the pattern to follow.

## Global Constraints

- Work in the existing worktree `.claude/worktrees/agent-providers` on branch `feature/agent-providers`. Commands run from `code/flowboard/` unless stated.
- Same code rules as the Claude plan: Node 24 type stripping (erasable syntax only, `import type`, `.ts` relative imports), `node:test` + `node:assert/strict`, `@flowboard/core` has no dependencies and never imports adapters.
- Pin `@opencode-ai/sdk` to exactly `1.19.3` and import only from `@opencode-ai/sdk/v2`. Never use the root import (legacy API) or the separate 2.x package `@opencode/sdk`. The installed CLI is `/opt/homebrew/bin/opencode` 1.19.3.
- Provider id `'opencode'`.
- One `opencode serve` per run, `--hostname 127.0.0.1 --port 0`, with a random per-run `OPENCODE_SERVER_PASSWORD` (basic auth, username `opencode`).
- Isolation env for every server: `XDG_CONFIG_HOME=<fresh mkdtemp dir, deleted after the run>`, `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_CLAUDE_CODE=1`, `OPENCODE_DISABLE_AUTOUPDATE=1`, `OPENCODE_CONFIG_CONTENT=<JSON>`. Never touch `XDG_DATA_HOME`: it holds OpenCode's `auth.json` (the owner's credentials) and the session database that resume needs.
- Models: `RunSpec.model` is a logical id; `resolveModel` maps it through a table passed to the constructor. A value is `"<providerID>/<modelID>"` split on the **first** `/` (OpenRouter model ids contain slashes). A logical id that already contains `/` passes through. An unknown id fails the run with `no OpenCode model for logical id '<id>'`.
- Credentials: OpenCode's own login. Today the owner's only OpenCode credential is an OpenRouter API key, so **live tests spend real money** (cents). They run only when `FLOWBOARD_OPENCODE_MODEL` is set to a `providerID/modelID`.
- Out of scope: Codex, ACP, `run_events` persistence, flow-editor capability greying, the 2.x SDK.

## Decisions this plan makes

| Topic | Decision |
|---|---|
| Session id | Server-generated; the `system` event is emitted after `session.create` / `session.fork` returns |
| Resume | `fork: true` → `session.fork`; otherwise prompt the stored session again. Either way `session.update` re-applies the run's permission rules, which a fork drops |
| Permissions | Ordered rules (last match wins): `ask` everything, `allow` read-only tools, then `toolPolicy.allow`, then `toolPolicy.deny`, then each injected MCP server's tools as `allow`. `bypassPermissions` replaces the base with `allow` everything. The adapter answers every `permission.asked`: `once` under `bypassPermissions` / `auto`, `once` for `edit` under `acceptEdits`, else `reject` with the message `Not permitted in this headless run.` |
| Effort | Passed as `variant` only when the resolved model lists that variant (`config.providers`); else dropped |
| `maxTurns` | `agent.build.steps` in the injected config |
| `maxBudgetUsd` | Enforced by the adapter: when the running `costUsd` reaches the cap, `session.abort` and error `max_budget: spent $<x> of $<cap>` |
| Skills | A `plugin_dir` pack mounts `<path>/skills` via `skills.paths`; `invocation` `/<plugin>:<slug>` renders as `Use the "<slug>" skill.` in its canonical place |
| Guards | `guard-plugin.ts`, loaded via config `plugin`, reads `FLOWBOARD_GUARDS` from the server env and throws the `checkToolCall` reason from `tool.execute.before` |
| Usage | Sum of `step-finish` parts across the root session and its child sessions; `output` = `output + reasoning`; `numTurns` = number of `step-finish` parts; `costUsd` = summed `cost` |
| Exit code | The server is killed by the adapter at the end, so `exitCode` is `0` for a run with no error, `1` for a run with an error, the server's own code if it died before the run ended, `130` after `stop()` |

## Review Focus

1. A `permission.asked` the adapter does not answer — including one from a child (subagent) session — hangs the run forever. Test: Task 6, `answers permission requests per mode` (root and child).
2. An OpenRouter model `openrouter/openai/gpt-4.1-mini` split on the last `/` sends the wrong provider id. Test: Task 3, `splits the model on the first slash`.
3. The user's own prompt arrives as a `text` part on the user message and would be shown as the agent's reply. Test: Task 4, `skips user-message parts`.
4. Two runs launched at the same moment must not share a server, port or config dir. Test: Task 6, `two concurrent runs get separate servers`.
5. A run that fails (server crash, unknown model) must still delete its scratch config dir. Test: Task 6, `cleans up the config dir on failure`.

---

### Task 1: SDK, a real event capture, and the provider id

**Files:**
- Modify: `code/flowboard/packages/adapters/package.json` (dependency)
- Modify: `code/flowboard/packages/core/src/ports/agent-provider.ts` (`ProviderId` gains `'opencode'`)
- Create: `code/flowboard/packages/adapters/test/fixtures/capture-opencode.ts`
- Create: `code/flowboard/packages/adapters/test/fixtures/opencode-read.jsonl` (the captured output)

**Interfaces:**
- Produces: `opencode-read.jsonl` — one SSE event JSON per line, from `server.connected` to the root `session.idle`, for a run that reads a file and replies. Task 4 tests against it.

- [ ] **Step 1: Add the SDK**

Run: `pnpm --filter @flowboard/adapters add @opencode-ai/sdk@1.19.3`
Expected: `package.json` shows `"@opencode-ai/sdk": "1.19.3"` with no caret.

- [ ] **Step 2: Write the capture script**

`capture-opencode.ts` takes the model from `FLOWBOARD_OPENCODE_MODEL` and exits with a message when it is unset. It writes `hello.txt` containing `fixture-ok` into a fresh `mkdtemp` dir. It starts a server with `createOpencode({ hostname: '127.0.0.1', port: 0, config: { permission: 'allow' } })` from `@opencode-ai/sdk/v2`, then calls `client.session.create({ directory })`. It subscribes with `client.event.subscribe({ directory })` **before** prompting, and calls `client.session.promptAsync({ sessionID, directory, model, parts: [{ type: 'text', text: 'Read hello.txt and reply with its exact contents.' }] })`. It prints each event as one JSON line to stdout until the root session's `session.idle`, then closes the server. Add the comment `// Re-run to refresh the fixture when OpenCode's event shapes change; costs a few cents.`

- [ ] **Step 3: Capture**

Run: `FLOWBOARD_OPENCODE_MODEL=<model> node packages/adapters/test/fixtures/capture-opencode.ts > packages/adapters/test/fixtures/opencode-read.jsonl`
Expected: exit 0. The file contains at least `session.created`, `message.updated`, `message.part.updated` with parts of type `text`, `tool` (tool `read`, ending `completed`) and `step-finish`, and a final `session.idle`. If there is no `tool` part, re-run once; if there still is none, ledger it and continue (Task 4's synthetic tests cover tools).

- [ ] **Step 4: Add `'opencode'` to `ProviderId` and typecheck**

Run: `pnpm -s typecheck:packages`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters packages/core pnpm-lock.yaml
git commit -m "test(adapters): add OpenCode SDK and a captured event stream"
```

---

### Task 2: Permission mapping

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/opencode/permissions.ts`
- Test: `code/flowboard/packages/adapters/test/opencode-permissions.test.ts`

**Interfaces:**
- Consumes: `RunSpec`, `PermissionMode` from `@flowboard/core`; `PermissionRule` type from `@opencode-ai/sdk/v2`.
- Produces:
  - `toPermissionRules(spec: RunSpec): PermissionRule[]`
  - `replyFor(mode: PermissionMode | undefined, permission: string): { reply: 'once' } | { reply: 'reject'; message: string }`
  - `TOOL_NAMES: Record<string, string>` — Claude tool name → OpenCode permission key: `Read→read`, `Write→edit`, `Edit→edit`, `MultiEdit→edit`, `NotebookEdit→edit`, `Bash→bash`, `Glob→glob`, `Grep→grep`, `LS→list`, `WebFetch→webfetch`, `WebSearch→websearch`, `Task→task`, `Skill→skill`, `TodoWrite→todowrite`. Unknown names are lowercased.

A `toolPolicy` entry `Name` becomes `{ permission: TOOL_NAMES[Name], pattern: '*' }`; `Name(pattern)` becomes `{ permission, pattern }`; `mcp__<server>__*` becomes `{ permission: '<server>_*', pattern: '*' }`. Read-only keys allowed by default: `read`, `glob`, `grep`, `list`, `todowrite`, `skill`, `question`, `lsp`.

- [ ] **Step 1: Write the failing tests**

```ts
test('asks by default and allows read-only tools', () => {
  const rules = toPermissionRules(base);
  assert.deepEqual(rules[0], { permission: '*', pattern: '*', action: 'ask' });
  assert.ok(rules.some((r) => r.permission === 'read' && r.action === 'allow'));
});
test('maps the tool policy after the defaults', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { allow: ['Write', 'Bash(pnpm *)'], deny: ['WebFetch'] } });
  assert.deepEqual(rules.slice(-3), [
    { permission: 'edit', pattern: '*', action: 'allow' },
    { permission: 'bash', pattern: 'pnpm *', action: 'allow' },
    { permission: 'webfetch', pattern: '*', action: 'deny' },
  ]);
});
test('pre-approves injected tool servers last', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { deny: ['*'] }, tools: [{ name: 'vibe', command: 'node' }] });
  assert.deepEqual(rules.at(-1), { permission: 'vibe_*', pattern: '*', action: 'allow' });
});
test('bypassPermissions allows everything but keeps denies', () => {
  const rules = toPermissionRules({ ...base, permissionMode: 'bypassPermissions', toolPolicy: { deny: ['Bash(git push *)'] } });
  assert.deepEqual(rules[0], { permission: '*', pattern: '*', action: 'allow' });
  assert.deepEqual(rules.at(-1), { permission: 'bash', pattern: 'git push *', action: 'deny' });
});
test('replyFor answers by mode', () => {
  assert.deepEqual(replyFor('bypassPermissions', 'bash'), { reply: 'once' });
  assert.deepEqual(replyFor('auto', 'bash'), { reply: 'once' });
  assert.deepEqual(replyFor('acceptEdits', 'edit'), { reply: 'once' });
  assert.deepEqual(replyFor('acceptEdits', 'bash'), { reply: 'reject', message: 'Not permitted in this headless run.' });
  assert.deepEqual(replyFor(undefined, 'edit'), { reply: 'reject', message: 'Not permitted in this headless run.' });
});
```

`base` is a minimal `RunSpec` with `cwd: '/repo/wt'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/opencode-permissions.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `toPermissionRules`, `replyFor`, `TOOL_NAMES`**

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test packages/adapters/test/opencode-permissions.test.ts && pnpm -s typecheck:packages`
Expected: 5 pass; no tsc output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): map RunSpec permissions to OpenCode rules"
```

---

### Task 3: `RunSpec` → server env, config and prompt

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/opencode/options.ts`
- Test: `code/flowboard/packages/adapters/test/opencode-options.test.ts`

**Interfaces:**
- Consumes: `renderPrompt`, `RunSpec` from `@flowboard/core`; `toPermissionRules` (Task 2); `Config` type from `@opencode-ai/sdk/v2`.
- Produces:
  - `splitModel(id: string): { providerID: string; modelID: string }` — on the first `/`; throws on an id without `/`.
  - `buildLaunch(spec: RunSpec, base: { env: NodeJS.ProcessEnv; configHome: string; password: string; guardPlugin: string }): { env: NodeJS.ProcessEnv; config: Config; permission: PermissionRule[]; prompt: { model: { providerID: string; modelID: string }; system?: string; parts: [{ type: 'text'; text: string }] } }` — `spec.model` is already resolved to `providerID/modelID`.
  - `pickVariant(effort: Effort | undefined, variants: string[]): string | undefined` — `effort` when the model lists it, else `undefined`.

Config contents: `mcp[name] = { type: 'local', command: [command, ...args], environment: env, enabled: true }`; `skills.paths` = `<path>/skills` for each `plugin_dir` pack; `agent.build.steps` = `limits.maxTurns` when set; `plugin: [pathToFileURL(guardPlugin).href]` only when `spec.guards` is set; each `native` pack's `config` shallow-merged last. Env: `base.env` plus the isolation variables from Global Constraints, `OPENCODE_SERVER_PASSWORD: password`, and `FLOWBOARD_GUARDS: JSON.stringify(spec.guards)` when set. `system` = `spec.systemPrompt` and every `system_prompt` pack joined by `\n\n`, absent when empty.

- [ ] **Step 1: Write the failing tests**

```ts
test('splits the model on the first slash', () => {
  assert.deepEqual(splitModel('openrouter/openai/gpt-4.1-mini'), { providerID: 'openrouter', modelID: 'openai/gpt-4.1-mini' });
  assert.throws(() => splitModel('haiku'));
});
test('isolates the server and injects the config', () => {
  const { env } = buildLaunch(spec, base);
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/fb-oc-cfg');
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  assert.equal(env.OPENCODE_DISABLE_CLAUDE_CODE, '1');
  assert.equal(env.OPENCODE_DISABLE_AUTOUPDATE, '1');
  assert.equal(env.OPENCODE_SERVER_PASSWORD, 'pw');
  assert.equal(env.XDG_DATA_HOME, base.env.XDG_DATA_HOME); // credentials and sessions untouched
  assert.deepEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT!), buildLaunch(spec, base).config);
  assert.deepEqual(JSON.parse(env.FLOWBOARD_GUARDS!), { writeRoots: ['/repo/wt'] });
});
test('maps tools, skills, turns and guards into config', () => {
  const { config } = buildLaunch(spec, base);
  assert.deepEqual(config.mcp, { vibe: { type: 'local', command: ['node', 'shim.js'], environment: undefined, enabled: true } });
  assert.deepEqual(config.skills, { paths: ['/plugins/fbecho/skills'] });
  assert.deepEqual(config.agent, { build: { steps: 5 } });
  assert.deepEqual(config.plugin, ['file:///abs/guard-plugin.ts']);
});
test('renders the skill invocation as an instruction', () => {
  assert.match(buildLaunch(spec, base).prompt.parts[0].text, /Use the "echo" skill\./);
});
test('passes effort as a variant only when the model has it', () => {
  assert.equal(pickVariant('high', ['low', 'high']), 'high');
  assert.equal(pickVariant('max', ['high']), undefined);
  assert.equal(pickVariant(undefined, ['high']), undefined);
});
test('joins system prompts and omits guards when unset', () => {
  const out = buildLaunch({ ...spec, guards: undefined }, base);
  assert.equal(out.prompt.system, 'You are the planner.\n\nBe terse.');
  assert.equal(out.config.plugin, undefined);
  assert.equal(out.env.FLOWBOARD_GUARDS, undefined);
});
```

`spec` mirrors the Claude options test fixture with `model: 'openrouter/openai/gpt-4.1-mini'`; `base = { env: { PATH: '/bin', XDG_DATA_HOME: '/home/x/.local/share' }, configHome: '/tmp/fb-oc-cfg', password: 'pw', guardPlugin: '/abs/guard-plugin.ts' }`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/opencode-options.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `splitModel`, `buildLaunch` and `pickVariant`**

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test packages/adapters/test/opencode-options.test.ts && pnpm -s typecheck:packages`
Expected: 6 pass; no tsc output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): map RunSpec to OpenCode server env, config and prompt"
```

---

### Task 4: OpenCode event normalizer

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/opencode/normalize.ts`
- Test: `code/flowboard/packages/adapters/test/opencode-normalize.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent`, `Usage`, `ZERO_USAGE` from `@flowboard/core`; `Event` type from `@opencode-ai/sdk/v2`; `summarizeTool` from `../claude/normalize.ts` (move it to `packages/adapters/src/agent/summarize.ts` and re-import it in the Claude normalizer, since two providers now share it).
- Produces: `createNormalizer(rootSessionID: string): (event: Event) => NormalizedEvent[]`. Every event carries `raw: event`.

Mapping. "Ours" means the root session or a session whose `session.created` named an "ours" session as `parentID`. Events of other sessions produce nothing.

| Event | Output |
|---|---|
| `message.updated` with `info.role === 'user'` | remember `info.id` as a user message |
| `message.updated` assistant with `info.error` | `error { message: '<error.name>: <error.data.message>' }`, once per message id |
| `message.part.updated`, part of a user message | nothing |
| `text` part with `time.end` set, not `synthetic` | `assistant_text`, once per part id |
| `reasoning` part with `time.end` set | `thinking`, once per part id |
| `tool` part, first time seen with status `running`, `completed` or `error` | `tool_use { name: part.tool, input: state.input, summary }`, once per `callID` |
| `tool` part `completed` / `error` | `tool_result { ok, output: state.output / state.error }`, once per `callID` |
| `step-finish` | add to the running usage (Decisions table), emit `usage` |
| `session.error` for an "ours" session | `error { message: '<name>: <data.message>' }` |
| `session.idle` for the root session | `result { usage }` |
| `message.part.delta` and everything else | nothing |

- [ ] **Step 1: Write the failing tests**

```ts
test('normalizes the captured read run', () => {
  const lines = readFileSync(new URL('./fixtures/opencode-read.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const root = lines.find((e) => e.type === 'session.created').properties.info.id;
  const events = lines.flatMap(createNormalizer(root));
  assert.equal(events.at(-1)!.type, 'result');
  assert.ok(events.some((e) => e.type === 'assistant_text' && /fixture-ok/.test(e.text)));
  // expectedFromSteps: a test helper that sums the capture's step-finish parts per the Decisions table
  assert.deepEqual((events.at(-1) as { usage: Usage }).usage, expectedFromSteps(lines));
});
test('skips user-message parts', () => { /* message.updated role user id m1, text part of m1 → [] */ });
test('emits a text part once, when it ends', () => { /* same part updated without end, then with end, then again → one assistant_text */ });
test('maps tool parts to one tool_use and one tool_result', () => {
  // callID c1, tool 'bash', state running { input: { command: 'pnpm test' } }
  //   → [{ type:'tool_use', name:'bash', input:{ command:'pnpm test' }, summary:'bash: pnpm test' }]
  // the same part again, still running → []
  // c1 completed { output: 'ok' } → [{ type:'tool_result', ok:true, output:'ok' }]
  // callID c2 first seen as error { input:{}, error:'boom' } → tool_use, then { type:'tool_result', ok:false, output:'boom' }
});
test('sums step-finish usage across the root and child sessions', () => {
  // two step-finish parts (root and child via session.created parentID=root):
  // tokens {input:10, output:5, reasoning:3, cache:{read:100, write:7}}, cost 0.01 each
  // last usage → { input:20, output:16, cacheRead:200, cacheWrite:14, numTurns:2, costUsd:0.02 }
});
test('ignores other sessions', () => { /* step-finish for sessionID 'ses_other' → [] */ });
test('reports assistant and session errors', () => {
  // message.updated assistant error {name:'APIError', data:{message:'429'}} → 'APIError: 429'
  // session.error root {error:{name:'ProviderAuthError', data:{message:'no key'}}} → 'ProviderAuthError: no key'
});
test('ends with result on root idle only', () => { /* child idle → []; root idle → [result] */ });
```

Summaries keep OpenCode's own tool names. Extend `summarizeTool` so `bash` is summarized like `Bash` (`bash: <command>`) and `args.filePath` counts as a path (`edit src/a.ts`).

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/opencode-normalize.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Move `summarizeTool`, extend it, implement `createNormalizer`**

- [ ] **Step 4: Run them to verify they pass, with the Claude tests**

Run: `pnpm -s test:packages && pnpm -s typecheck:packages`
Expected: all pass (the Claude normalizer tests still pass after the move); no tsc output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): normalize OpenCode events"
```

---

### Task 5: Guard plugin

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/opencode/guard-plugin.ts`
- Test: `code/flowboard/packages/adapters/test/opencode-guard-plugin.test.ts`

**Interfaces:**
- Consumes: `checkToolCall`, `GuardRules` from `@flowboard/core`.
- Produces: the module's only export `FlowboardGuard: (input: { directory: string }) => Promise<{ 'tool.execute.before': (input: { tool: string }, output: { args: Record<string, unknown> }) => Promise<void> }>`. OpenCode loads every exported function of a plugin file as a plugin, so the file exports nothing else.

Behaviour: rules from `JSON.parse(process.env.FLOWBOARD_GUARDS)`; no env means a no-op hook. `write` / `edit` check `('Write', { file_path: args.filePath })`; `apply_patch` checks every path on a `*** Add File: `, `*** Update File: `, `*** Delete File: ` or `*** Move to: ` line of `args.patchText`; `bash` checks `('Bash', { command: args.command })`. `cwd` is the plugin input's `directory`. A reason is thrown as `new Error(reason)`.

- [ ] **Step 1: Write the failing tests**

```ts
// before each: process.env.FLOWBOARD_GUARDS = JSON.stringify({ writeRoots: ['/repo/wt'], denyCommands: ['\\bgit\\s+push\\b'] })
test('blocks a write outside the worktree', async () => {
  const hooks = await FlowboardGuard({ directory: '/repo/wt' });
  await assert.rejects(hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: '/etc/x' } }), /Write outside the worktree: \/etc\/x/);
  await hooks['tool.execute.before']({ tool: 'edit' }, { args: { filePath: '/repo/wt/a.ts' } }); // resolves
});
test('checks every path in an apply_patch', async () => {
  const patchText = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** Add File: /etc/evil\n+x\n*** End Patch';
  await assert.rejects(hooks['tool.execute.before']({ tool: 'apply_patch' }, { args: { patchText } }), /\/etc\/evil/);
});
test('blocks a denied command', async () => { /* bash 'git push origin main' rejects /Command blocked by policy/ */ });
test('is a no-op without FLOWBOARD_GUARDS', async () => { /* delete env; write /etc/x resolves */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/opencode-guard-plugin.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `FlowboardGuard`**

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test packages/adapters/test/opencode-guard-plugin.test.ts && pnpm -s typecheck:packages`
Expected: 4 pass; no tsc output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): add OpenCode guard plugin"
```

---

### Task 6: `OpencodeProvider` and the server process

**Files:**
- Create: `code/flowboard/packages/adapters/src/agent/opencode/server.ts`
- Create: `code/flowboard/packages/adapters/src/agent/opencode/provider.ts`
- Modify: `code/flowboard/packages/adapters/src/index.ts` (re-export the provider)
- Create: `code/flowboard/packages/adapters/test/fixtures/fake-opencode.mjs` (executable)
- Create: `code/flowboard/packages/adapters/test/fixtures/fake-opencode-crash.sh` (executable: `echo "bad config" >&2; exit 2`)
- Test: `code/flowboard/packages/adapters/test/opencode-provider.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5; `hostExecHost`; `createOpencodeClient` from `@opencode-ai/sdk/v2`.
- Produces:
  - `startServer(exec: ExecHost, opts: { opencodePath: string; cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ url: string; child: ChildProcessWithoutNullStreams; stderrTail: () => string }>` — spawns `<opencodePath> serve --hostname 127.0.0.1 --port 0`, resolves on the stdout line matching `/opencode server listening on (http:\/\/\S+)/`, rejects with `opencode server exited with code <n>: <stderr tail>` on early exit or `opencode server did not start within <ms> ms` after `timeoutMs` (default 30,000).
  - `class OpencodeProvider implements AgentProvider` with `constructor(opts: { models: Record<string, string>; opencodePath?: string; env?: NodeJS.ProcessEnv })`; `id = 'opencode'`; capabilities `effort`, `sessions`, `resume_fork`, `mcp_tools`, `plugins`, `allowed_tools`, `permission_modes`, `native_cost`, `partial_stream`, `budget_cap`, `tool_hooks`.

`launch(spec)` sequence, all inside a pump that never throws (failures become an `error` event and `RunResult.error`, as in the Claude provider):
1. `resolveModel` (failure → error, skip to cleanup); `mkdtemp(join(tmpdir(), 'fb-oc-'))` as the config home; a random 24-byte hex password; `buildLaunch`.
2. `startServer` through `spec.exec ?? hostExecHost`; resolve `pid`.
3. `createOpencodeClient({ baseUrl, directory: spec.cwd, headers: { Authorization: 'Basic ' + base64('opencode:' + password) } })`.
4. `config.providers()` → the resolved model's variant names → `pickVariant(spec.effort, names)` → `variant` on the prompt. (`buildLaunch` runs before step 2, since the server's env needs its config.)
5. `event.subscribe({ directory })` before anything is prompted.
6. Session: `resume.fork` → `session.fork`; `resume` without fork → the stored id; else `session.create({ directory, permission })`. For a resumed or forked session, `session.update({ sessionID, permission })`. Emit `system` and resolve `sessionId`.
7. `session.promptAsync({ sessionID, directory, ...prompt, agent: 'build' })`.
8. For each event: `permission.asked` from an "ours" session → `permission.reply({ requestID, ...replyFor(...) })`; feed the normalizer and emit; on `usage` past `maxBudgetUsd` → `session.abort` + `max_budget` error; stop on the `result` or after `session.abort`.
9. Cleanup in `finally`: kill the server (`SIGTERM`), await its exit, `rm -rf` the config home.

`stop()` sets `stopped`, calls `session.abort` when a session exists, and lets the pump's cleanup run; the result is `{ exitCode: 130, error: 'stopped' }` unless the `result` event already arrived.

`fake-opencode.mjs` contract (plain JS, `node:http` only, no dependencies):
- Accepts `serve --hostname H --port P`; listens on port 0; prints `opencode server listening on http://127.0.0.1:<port>`.
- Rejects any request whose `Authorization` is not `Basic base64('opencode:' + OPENCODE_SERVER_PASSWORD)` with 401.
- On start, appends `{ env: { XDG_CONFIG_HOME, OPENCODE_CONFIG_CONTENT, OPENCODE_DISABLE_PROJECT_CONFIG, OPENCODE_DISABLE_CLAUDE_CODE, FLOWBOARD_GUARDS } }` to the JSONL file `FAKE_OPENCODE_LOG`, then one `{ method, path, body }` line per request.
- `GET /config/providers` → one provider `fake` with model `m1` whose `variants` is `{ high: {} }`.
- `POST /session` → `{ id: 'ses_fake1', directory }`; `POST /session/:id/fork` → `{ id: 'ses_fork1', directory }`; `PATCH /session/:id` → `{}`.
- `GET /event` → SSE. After `POST /session/:id/prompt_async` (answers 204), it streams the JSON events in the file `FAKE_OPENCODE_SCRIPT`, replacing `"$SESSION"` with the session id. On a `permission.asked` event it waits for `POST /permission/:id/reply` before continuing. On an event `{ "hold": true }` it stops streaming until `POST /session/:id/abort`, which answers `true` and then sends that session's `session.idle`.

- [ ] **Step 1: Write the fake server and the failing tests**

Scripts are written per test into a temp dir. Tests (model table `{ default: 'fake/m1' }`, `spec.cwd` = a temp dir):

```ts
test('runs a scripted session end to end', async () => {
  // script: message.updated user m0; text part of m0; message.updated assistant m1;
  //         text part of m1 'hi' with time.end; step-finish (cost 0.01); session.idle $SESSION
  // → types ['system', 'assistant_text', 'usage', 'result']; sessionId 'ses_fake1'; pid > 0
  // → result { exitCode: 0, error: undefined, usage.costUsd: 0.01 }
  // → log: POST /session body.permission is an array; prompt_async body.model { providerID:'fake', modelID:'m1' }, agent 'build'
});
test('passes effort as a variant the model has', async () => { /* effort 'high' → prompt_async body.variant 'high' */ });
test('answers permission requests per mode', async () => {
  // script: session.created child ses_child parentID $SESSION; permission.asked id per_1 on $SESSION (bash);
  //         permission.asked id per_2 on ses_child (edit); session.idle $SESSION
  // default mode → both replies { reply:'reject', message:'Not permitted in this headless run.' }
  // bypassPermissions → both { reply:'once' }; the run completes (no hang)
});
test('resume with fork forks and re-applies permissions', async () => {
  // resume { sessionId:'ses_old', fork:true } → log has POST /session/ses_old/fork and PATCH /session/ses_fork1 with permission
  // → sessionId 'ses_fork1'
});
test('budget cap aborts the session', async () => {
  // script: two step-finish cost 0.5 each, then { hold: true }; limits { maxBudgetUsd: 0.6 }
  // → log has POST /session/ses_fake1/abort; result.error 'max_budget: spent $1.00 of $0.60'
});
test('stop() aborts the session and settles as stopped', { timeout: 10_000 }, async () => {
  // script: [{ hold: true }]; stop() after sessionId resolves → log has abort; result { exitCode:130, error:'stopped' }
});
test('isolates the server from personal config', async () => {
  // guards { writeRoots:[cwd] } → env line: XDG_CONFIG_HOME under os.tmpdir(), OPENCODE_DISABLE_PROJECT_CONFIG '1',
  // OPENCODE_DISABLE_CLAUDE_CODE '1', FLOWBOARD_GUARDS set, OPENCODE_CONFIG_CONTENT.plugin[0] ends with 'guard-plugin.ts'
  // → after result: existsSync(XDG_CONFIG_HOME) === false
});
test('two concurrent runs get separate servers', async () => {
  // launch two runs at once → both results exitCode 0; pids differ; the two env lines' XDG_CONFIG_HOME differ
});
test('cleans up the config dir on failure', async () => {
  // opencodePath fake-opencode-crash.sh → result { exitCode: 2 }, error matches /bad config/
  // → no fb-oc-* dir created by this run remains (compare tmpdir listing before/after)
  // model 'unknown-model' → result.error "no OpenCode model for logical id 'unknown-model'"
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test packages/adapters/test/opencode-provider.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `provider.ts`.

- [ ] **Step 3: Implement `startServer` and `OpencodeProvider`**

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm -s test:packages && pnpm -s typecheck:packages`
Expected: all pass; no tsc output.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): add OpencodeProvider over a per-run opencode server"
```

---

### Task 7: Live check and docs

**Files:**
- Create: `code/flowboard/packages/adapters/test/opencode-live.test.ts`
- Modify: `code/flowboard/package.json` (`test:live` runs both live files)
- Create: `docs/FlowBoard/Agent Providers/OpenCode Adapter.md`
- Modify: `docs/FlowBoard/Agent Providers/Agent Providers Index.md` (link under *The adapters*)

**Interfaces:**
- Consumes: `OpencodeProvider` (Task 6).

Live tests run only when `FLOWBOARD_OPENCODE_MODEL` is set; the provider gets `models: { default: process.env.FLOWBOARD_OPENCODE_MODEL }` and each spec uses `model: 'default'`, a fresh temp `cwd`, `limits: { maxTurns: 4 }`.

- [ ] **Step 1: Write the live tests**

```ts
test('reads a file and replies on the real server', live, async () => {
  // cwd has hello.txt 'live-ok'; preamble 'Read hello.txt and reply with its exact contents.'
  // → some assistant_text matches /live-ok/; a tool_use named 'read'; res.error undefined; res.usage.output > 0
});
test('mounts a plugin skill', live, async () => {
  // capabilities [plugin_dir fixtures/fbecho-plugin]; invocation '/fbecho:echo' → assistant_text matches /ECHO-OK/
});
test('guard plugin blocks a write outside the worktree', live, async () => {
  // permissionMode 'bypassPermissions', guards { writeRoots:[cwd] }; preamble asks to write <tmpdir>/fb-oc-guard-<uuid>.txt
  // → the file does not exist; a tool_result with ok false whose output mentions 'Write outside the worktree'
});
```

- [ ] **Step 2: Run them**

Run: `FLOWBOARD_OPENCODE_MODEL=<model> FLOWBOARD_LIVE=1 node --test packages/adapters/test/opencode-live.test.ts`
Expected: 3 pass. If the skill test fails, check whether the model called the `skill` tool before changing code; record what OpenCode actually does in the doc note. Then run `pnpm -s test:packages` and confirm the live tests are skipped.

- [ ] **Step 3: Write `OpenCode Adapter.md`**

Same house style as `Claude Code Adapter.md` (frontmatter `tags: [flowboard, agent-providers, adapter, opencode]`, cited, sentence case, wikilinks). Sections: what it is and why (the second implementation, [[Provider SDK Fit Analysis]]), the per-run server, the `RunSpec` mapping table (the Decisions table of this plan), capabilities, isolation and credentials, what the live run verified, and Related. Add the Index link `- [[OpenCode Adapter]] — the second real provider: a per-run opencode server, non-Claude models`.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters package.json "../../docs/FlowBoard/Agent Providers"
git commit -m "test(adapters): live-check the OpenCode provider; document it"
```

## Skipped on purpose

- **Server pooling.** One server per run costs about a second of startup; pool only if that shows up in step latency.
- **Re-attach after a worker restart.** OpenCode can do it (sessions persist, the server can outlive the worker), but the port has no re-attach method yet ([[Agent Providers Open Questions]] #30).
- **Structured output for `outcome`.** The Execution component's call, as for Claude.
- **Isolating `~/.opencode`.** It does not exist on this machine; `XDG_CONFIG_HOME` covers `~/.config/opencode`.
