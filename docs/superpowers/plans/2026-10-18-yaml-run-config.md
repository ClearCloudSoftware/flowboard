# YAML Run Config and `run-agent` CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm run-agent <task.yaml>` reads one YAML file, validates it, launches the Claude Code or OpenCode provider in the named folder, prints events live and writes a JSONL log under `runs/`.

**Architecture:** A new workspace package `packages/cli` (`@flowboard/cli`) with two modules: `config.ts` turns a YAML file into a validated `RunSpec` (or a list of error lines), and `run.ts` launches the provider, streams, logs and maps the result to an exit code. `main.ts` is a one-line entry point. Tests inject the provider (a `ReplayProvider`) so they spend nothing.

**Tech Stack:** TypeScript on Node 24 type stripping, `node:test`, pnpm 10 workspaces, `yaml` 2.9.x, `zod` 4.6.x, `@flowboard/core`, `@flowboard/adapters`.

**Spec:** `docs/superpowers/specs/2026-10-18-yaml-run-config-design.md`

## Global Constraints

- Code rules: erasable syntax only, `import type` for types, `.ts` relative imports, tests with `node:test` + `node:assert/strict`; commands run from `code/flowboard/`.
- Package: `code/flowboard/packages/cli`, name `@flowboard/cli` — never `runner` (architecture rule: *"core/ and runner/ must never import from adapters/"*).
- Dependencies: `@flowboard/core` and `@flowboard/adapters` (`workspace:*`), `yaml` (^2.9.1), `zod` (^4.6.7). Nothing else.
- Every relative path (the YAML path argument, `folder`, `prompt`, `plugins`, `runs/`) resolves against the folder `pnpm` was run from: `process.env.INIT_CWD ?? process.cwd()`. Absolute paths are used as written.
- Error line format: `<yaml path as typed>: <field>: <message>`; bad config or bad usage → exit **2**, nothing launched.
- Fixed prompt closing: `This is a headless run: there is no terminal to ask into. Do the task, then stop.`
- Default `permissions.mode`: `acceptEdits`.
- Unrestricted-shell message: `<yaml>: <field>: <what> lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it`.
- Exit codes: **0** result has no `error` and `exitCode` 0; **130** result `error === 'stopped'` (both providers report `{ exitCode: 130, error: 'stopped' }`); **1** otherwise.
- Automated tests spend nothing; live tests only under `FLOWBOARD_LIVE=1`.
- The runner never touches `.gitignore`.

## Review Focus

1. Two runs started in the same second must not share or clobber a log file: the second gets `-2` appended (`…-claude-code-2.jsonl`). Test in Task 3.
2. An empty YAML file, a YAML whose root is a list or scalar, or a missing YAML file must give an error line and exit 2, not a stack trace. Tests in Task 2.
3. A prompt file that is empty (or only whitespace) while no `skill` is set gives `prompt: file is empty` — the agent would otherwise get no task. Test in Task 2.
4. A provider whose event stream throws mid-run (server died, SDK bug) must still end with a `result` line in the log and exit 1. Test in Task 3.
5. `folder: ~/proj` — a hand-written YAML will use `~`. A leading `~/` (or a bare `~`) expands to the home directory. Test in Task 1.

---

### Task 1: Package and config → `RunSpec`

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts`

**Interfaces:**
- Consumes: `RunSpec`, `PermissionMode`, `Effort`, `CapabilityPack`, `DEFAULT_DENY_COMMANDS` from `@flowboard/core`.
- Produces:
  ```ts
  export type Adapter = 'claude-code' | 'opencode';
  export const CLOSING = 'This is a headless run: there is no terminal to ask into. Do the task, then stop.';
  export interface RunConfig { yamlPath: string /* absolute */; adapter: Adapter; spec: RunSpec; unrestrictedShell: boolean }
  export type LoadResult = { ok: true; config: RunConfig } | { ok: false; errors: string[] };
  export function loadConfig(yamlPath: string, baseDir: string): LoadResult;
  ```
  `unrestrictedShell` is true when the YAML sets `permissions.allow_unrestricted_shell: true` *and* a trigger (Task 2) holds; Task 3 prints the warning from it.

- [ ] **Step 1: Create the package**

`packages/cli/package.json`: `"name": "@flowboard/cli"`, `"private": true`, `"type": "module"`, dependencies as in Global Constraints. Run `pnpm install`. Expected: lockfile updated, `packages/cli/node_modules/yaml` exists.

- [ ] **Step 2: Write the failing tests**

Each test builds a temp base dir (`mkdtempSync`) holding `proj/` (dir), `task.md` (`Fix the bug.`), `plugins/fbecho/` (dir) and writes `task.yaml`, then calls `loadConfig('task.yaml', base)`.

```ts
test('full YAML maps to the RunSpec', () => {
  // YAML: every field of the spec's example, with folder: proj, prompt: task.md,
  // plugins: [plugins/fbecho], skill: /fbecho:echo, system_prompt: Be careful.,
  // effort: high, permissions {mode: dontAsk, allow: [Read, "Bash(pnpm *)"], deny: [WebFetch]},
  // guards {deny_paths: [docs/**], deny_commands: ['\bnpm\s+publish\b']},
  // limits {budget_usd: 0.5, max_turns: 20}
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok);
  assert.equal(r.config.adapter, 'claude-code');
  assert.equal(r.config.yamlPath, join(base, 'task.yaml'));
  assert.deepEqual(r.config.spec, {
    model: 'sonnet', effort: 'high', cwd: join(base, 'proj'),
    prompt: { preamble: 'Fix the bug.', inputs: [], outputs: [], invocation: '/fbecho:echo', closing: CLOSING },
    systemPrompt: 'Be careful.',
    capabilities: [{ id: 'fbecho', provider: 'claude-code', mount: { kind: 'plugin_dir', path: join(base, 'plugins/fbecho') } }],
    permissionMode: 'dontAsk',
    toolPolicy: { allow: ['Read', 'Bash(pnpm *)'], deny: ['WebFetch'] },
    guards: { writeRoots: [join(base, 'proj')], denyPaths: ['docs/**'], denyCommands: [...DEFAULT_DENY_COMMANDS, String.raw`\bnpm\s+publish\b`] },
    limits: { maxBudgetUsd: 0.5, maxTurns: 20 },
  });
  assert.equal(r.config.unrestrictedShell, false);
});

test('minimal YAML gets the defaults', () => {
  // adapter, model, folder, prompt only
  // spec.permissionMode === 'acceptEdits'; guards deepEqual { writeRoots: [proj], denyCommands: DEFAULT_DENY_COMMANDS };
  // no effort / systemPrompt / capabilities / toolPolicy / limits keys (assert `!('effort' in spec)` etc.); prompt.invocation undefined
});

test('absolute paths are used as written', () => { /* folder: <abs path of another temp dir> → spec.cwd equals it */ });

test('a leading ~ expands to the home directory', () => {
  // folder: ~/<basename of a temp dir created under os.homedir()> → spec.cwd === that dir; clean it up after
});
```

- [ ] **Step 3: Run to see them fail**

Run: `node --test packages/cli/test/config.test.ts`
Expected: FAIL — cannot find module `../src/config.ts`.

- [ ] **Step 4: Implement `loadConfig` in `packages/cli/src/config.ts`**

Read the file, `parse` with `yaml`, validate with a `z.strictObject` schema (nested `permissions`, `guards`, `limits` also strict), then build the `RunSpec`. Path resolution: `~` / `~/…` → `os.homedir()`, then `path.resolve(baseDir, p)`. Plugin id = `basename` of its path. Leave optional `RunSpec` keys out entirely when the YAML omits them. Task 2 owns the error lines; here an invalid file may return `{ ok: false, errors: [] }`.

- [ ] **Step 5: Run to see them pass**

Run: `node --test packages/cli/test/config.test.ts && pnpm typecheck:packages`
Expected: 4/4 pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): load a YAML run config into a RunSpec"
```

---

### Task 2: Validation errors and the unrestricted-shell rule

**Files:**
- Modify: `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts`

**Interfaces:**
- Consumes: Task 1's `loadConfig`.
- Produces: `loadConfig` returning `{ ok: false, errors }`, every line `` `${yamlPath}: ${field}: ${message}` `` with `yamlPath` as passed in.

Rules (schema first; the file-system and semantic checks run only when the schema passes, and all of their failures are collected):

| Field | Check | Message |
|---|---|---|
| `file` | YAML file missing | `not found` |
| `syntax` | YAML parse error | the parser's message, first line |
| `(root)` | root is not a mapping (empty file, list, scalar) | `must be a mapping` |
| `<path.to.key>` | unknown key | `unknown key` (one line per key) |
| `adapter`, `model`, `folder`, `prompt` | required | `required` |
| `adapter`, `effort`, `permissions.mode` | enum | `must be one of …` (zod's text is fine) |
| `limits.budget_usd` / `max_turns` | positive number / positive integer | zod's text |
| `folder`, `plugins.<i>` | existing directory | `not a directory: <abs path>` |
| `prompt` | existing file | `not a file: <abs path>` |
| `prompt` | blank and no `skill` | `file is empty` |
| `skill` | starts with `/` | `must start with "/"` |
| `model` | `opencode` model contains `/` | `opencode model must be "providerID/modelID"` |
| `guards.deny_commands.<i>` | `new RegExp(s)` compiles | `invalid regex: <error message>` |
| `permissions.mode` | `bypassPermissions` or `auto` without the opt-in | `<mode> lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it` |
| `permissions.allow` | an entry matching `/^bash(\(\*\))?$/i` without the opt-in | `"<entry>" lets shell commands …` (same tail) |

- [ ] **Step 1: Write the failing tests**

One test per row, each asserting `deepEqual(r, { ok: false, errors: ['task.yaml: <field>: <message>'] })` (for `syntax` and enum rows, `match` the line against `/^task\.yaml: syntax: /` etc.). Plus:

```ts
test('several file-system problems are reported together', () => {
  // folder: nope, prompt: nope.md → errors has 2 lines, folder first
});
test('bypassPermissions with the opt-in loads and flags unrestrictedShell', () => {
  // permissions: { mode: bypassPermissions, allow_unrestricted_shell: true } → ok, config.unrestrictedShell === true
});
test('auto mode, "Bash" and "bash(*)" each need the opt-in', () => { /* three YAMLs, three errors */ });
test('"Bash(pnpm *)" needs no opt-in', () => { /* ok, unrestrictedShell false */ });
test('an empty prompt is fine when a skill is set', () => { /* ok */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test packages/cli/test/config.test.ts`
Expected: the new tests FAIL (errors array empty or a thrown exception); Task 1's 4 still pass.

- [ ] **Step 3: Implement the checks in `loadConfig`**

Map zod issues to lines: `issue.path.join('.')` as the field (`(root)` when empty); for `unrecognized_keys` issues emit one line per key with field `<path>.<key>`.

- [ ] **Step 4: Run to see them pass**

Run: `node --test packages/cli/test/config.test.ts && pnpm typecheck:packages`
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): validate the YAML run config with field-named errors"
```

---

### Task 3: `runAgent` — launch, print, log, exit code

**Files:**
- Create: `packages/cli/src/run.ts`, `packages/cli/src/main.ts`
- Modify: `code/flowboard/package.json` (script `"run-agent": "node packages/cli/src/main.ts"`)
- Delete: `packages/adapters/try.ts`
- Test: `packages/cli/test/run.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `Adapter`, `RunConfig` (Task 1); `ClaudeCodeProvider`, `OpencodeProvider`, `ReplayProvider` from `@flowboard/adapters`.
- Produces:
  ```ts
  export interface RunDeps {
    cwd: string;                                         // base for every relative path
    makeProvider?: (adapter: Adapter) => AgentProvider;  // default: new ClaudeCodeProvider() / new OpencodeProvider({ models: {} })
    print?: (line: string) => void;                      // default console.log
    printErr?: (line: string) => void;                   // default console.error
    signals?: NodeJS.EventEmitter;                       // default process; 'SIGINT' is listened on
    exit?: (code: number) => void;                       // default process.exit; used by the second Ctrl+C
    now?: () => Date;                                    // default () => new Date()
  }
  export async function runAgent(args: string[], deps: RunDeps): Promise<number>;
  ```
  `main.ts`: `process.exitCode = await runAgent(process.argv.slice(2), { cwd: process.env.INIT_CWD ?? process.cwd() });`

Behaviour:
- `args.length !== 1` → `printErr('usage: pnpm run-agent <task.yaml>')`, return 2.
- Config errors → each line to `printErr`, return 2, no `runs/` created.
- Log: `mkdirSync(<cwd>/runs, { recursive: true })`; name `<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl` from `now()` in local time; if taken, `-2`, `-3`, … before `.jsonl` (open with flag `wx`). Every line written with `appendFileSync` as it happens: `{kind:'start', at, yaml, config: spec}`, `{kind:'event', at, event}` (with `raw`), `{kind:'result', at, result}`.
- Header via `print`: `-- <adapter> <model> in <folder>`, `-- log <abs log path>`, and when `unrestrictedShell`: `-- warning: unrestricted shell: commands can write outside <folder>`.
- Per event: `print(`${ev.type.padEnd(14)} ${JSON.stringify(evWithoutRaw).slice(0, 160)}`)`.
- End: `print('-- result ' + JSON.stringify(result))`.
- First SIGINT: `print('-- stopping')`, `run.stop()`. Second: `exit(130)`. Remove the listener before returning.
- Event stream throws: `run.stop()`, write result `{ usage: ZERO_USAGE, exitCode: 1, error: <message> }` to the log and print it, return 1 (do not await `run.result`).
- Return the exit code per Global Constraints.

- [ ] **Step 1: Write the failing tests**

Each test: a temp base with `proj/`, `task.md`, a valid `task.yaml` (`adapter: claude-code`), `print`/`printErr` pushing into arrays, `now: () => new Date(2026, 9, 18, 9, 5, 7)`, and `makeProvider: () => new ReplayProvider(script)`.

```ts
test('a successful run prints, logs and exits 0', async () => {
  // script: system, assistant_text 'hi', result (usage with costUsd 0.01)
  const code = await runAgent(['task.yaml'], deps);
  assert.equal(code, 0);
  const log = join(base, 'runs', '2026-10-18T09-05-07-claude-code.jsonl');
  const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.kind), ['start', 'event', 'event', 'event', 'result']);
  assert.equal(lines[0].config.cwd, join(base, 'proj'));
  assert.equal(lines[0].config.prompt.closing, CLOSING);
  assert.ok('raw' in lines[2].event);                     // script's assistant_text carries raw: { native: true }
  assert.equal(out[0], `-- claude-code sonnet in ${join(base, 'proj')}`);
  assert.equal(out[1], `-- log ${log}`);
  assert.ok(out.some((l) => l.startsWith('assistant_text ') && !l.includes('native')));
  assert.match(out.at(-1)!, /^-- result /);
});
test('a bad config prints field errors, exits 2 and creates no runs/', async () => { /* model missing → printErr has 'task.yaml: model: required' */ });
test('no argument prints usage and exits 2', async () => {});
test('a result with error exits 1', async () => { /* replay with script ending in an error event? use a fake AgentProvider whose result is { usage: ZERO_USAGE, exitCode: 0, error: 'boom' } */ });
test('Ctrl+C stops the run and exits 130', async () => {
  // ReplayProvider with streamDelayMs 20 and 50 events; signals = new EventEmitter(); emit 'SIGINT' after the first printed event
  // → code 130; out includes '-- stopping'; last log line is a result with error 'stopped'
});
test('a second Ctrl+C exits immediately', async () => { /* fake provider whose events never end; emit SIGINT twice → exit called with 130 */ });
test('two runs in the same second get separate logs', async () => { /* run twice → …-claude-code.jsonl and …-claude-code-2.jsonl */ });
test('an event stream that throws still logs a result and exits 1', async () => {
  // fake AgentProvider: events yields one assistant_text then throws Error('stream died'); result never settles
  // → code 1; last log line { kind: 'result', result: { exitCode: 1, error: 'stream died', … } }
});
test('the unrestricted-shell warning is printed', async () => { /* bypassPermissions + opt-in → out[2] starts '-- warning: unrestricted shell' */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test packages/cli/test/run.test.ts`
Expected: FAIL — cannot find module `../src/run.ts`.

- [ ] **Step 3: Implement `runAgent` in `packages/cli/src/run.ts` and `main.ts`; add the `run-agent` script; delete `packages/adapters/try.ts`**

- [ ] **Step 4: Run to see them pass, then the whole suite**

Run: `node --test packages/cli/test/run.test.ts && pnpm test:packages && pnpm typecheck:packages`
Expected: all pass (adapters' 6 live tests skipped); no type errors.

- [ ] **Step 5: Smoke the real entry point without spending**

Run: `d=$(mktemp -d) && printf 'adapter: claude-code\n' > "$d/fb-bad.yaml" && (cd "$d" && pnpm --dir <abs path to code/flowboard> run-agent fb-bad.yaml); echo "exit $?"`
Expected: `fb-bad.yaml: model: required` (and the other required fields), `exit 2` — proving `INIT_CWD` resolution.

- [ ] **Step 6: Commit**

```bash
git add packages/cli package.json packages/adapters/try.ts
git commit -m "feat(cli): run-agent launches the configured provider, prints and logs the run"
```

---

### Task 4: Live checks

**Files:**
- Create: `packages/cli/test/cli-live.test.ts`
- Modify: `code/flowboard/package.json` (`test:live` gains `packages/cli/test/cli-live.test.ts`)

**Interfaces:**
- Consumes: `runAgent` (Task 3) with the default `makeProvider`.

- [ ] **Step 1: Write the live tests** (`{ skip: !process.env.FLOWBOARD_LIVE, timeout: 180_000 }`)

```ts
test('claude-code: YAML run replies and logs a result', live, async () => {
  // temp base; task.md 'Reply with the single word OK. Do not use any tools.';
  // YAML: adapter claude-code, model haiku, folder proj, prompt task.md, limits { max_turns: 1, budget_usd: 0.2 }
  // → code 0; the log's last line is a result with exitCode 0 and no error; some event line has type assistant_text
});
test('opencode: YAML run replies and logs a result', live, async () => {
  // same, adapter opencode, model process.env.FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash'
});
```

- [ ] **Step 2: Run them**

Run: `FLOWBOARD_LIVE=1 node --test packages/cli/test/cli-live.test.ts`
Expected: 2/2 pass. (Spends Claude quota and a little OpenRouter credit.)

- [ ] **Step 3: Confirm they skip by default**

Run: `pnpm test:packages`
Expected: all pass, live tests reported as skipped.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/test/cli-live.test.ts package.json
git commit -m "test(cli): live-check run-agent on both adapters"
```
