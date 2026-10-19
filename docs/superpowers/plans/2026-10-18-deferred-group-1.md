# Deferred Fixes, Group 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight deferred issues the owner can hit while using `run-agent` today: a linked `folder`, stuck processes, OpenCode reading `.env`, split `rm` flags, unbounded OpenCode subagents, a late server error, stack traces at run setup, and wrong number-key docs.

**Architecture:** Small, independent fixes in the places each issue names. No new modules. Each fix gets a test that fails first.

**Tech Stack:** TypeScript on Node 24 type stripping, `node:test`, pnpm workspaces (`code/flowboard/packages/{core,adapters,cli}`).

**Spec:** the deferred-issue rows in `docs/FlowBoard/Agent Providers/Run Agent CLI Decisions.md` and `Provider Implementation Decisions.md`, plus the "group 1" list agreed in chat on 2026-10-18 (the `/tmp` link item was found in a real run and never recorded).

## Global Constraints

- Code rules: erasable syntax only, `import type`, `.ts` relative imports, `node:test` + `node:assert/strict`; commands run from `code/flowboard/`.
- Kill grace before `SIGKILL`: `5000` ms by default, overridable per provider with a `killGraceMs` constructor option (tests use `200`).
- OpenCode `.env` rules mirror OpenCode's own defaults: `read` of `*.env` and `*.env.*` → `ask`; `*.env.example` → `allow`. In a headless run `ask` is refused unless the mode is `bypassPermissions` or `auto`.
- OpenCode step limit goes on agents `build`, `plan`, `general` and `explore`.
- Setup failure after the log is open: result `{ usage: ZERO_USAGE, exitCode: 1, error: 'cannot set up the run: <message>' }`, logged and printed like any result, exit 1.
- Automated tests spend nothing.

## Review Focus

1. A `folder` path that does not exist still gives `folder: not a directory: <path>`, not a `realpath` stack trace. Test in Task 2.
2. Ordinary deletes stay allowed: `rm -r build`, `rm -rf ./dist`, `rm -f notes.txt`. Test in Task 1.
3. `.env.example` stays readable, and a YAML that allows `Read` does not re-open `.env`, while its `deny` list still applies. Test in Task 3.
4. A child that exits promptly on `SIGTERM` is never sent `SIGKILL`, and the grace timer does not keep Node alive. Test in Task 5.
5. A YAML whose prompt file is unreadable gives an error line and exit 2, with no `runs/` log created. Test in Task 6.

---

### Task 1: `rm` with split flags is blocked

**Files:** Modify `packages/core/src/guard.ts` (`DEFAULT_DENY_COMMANDS`, the `rm` entry). Test `packages/core/test/guard.test.ts`.

- [ ] **Step 1: Write the failing test** `'denies recursive rm of /, ~ or .. however the flags are written'`:

```ts
for (const command of ['rm -rf /', 'rm -r -f /', 'rm -f -r ~', 'rm -R ..', 'rm --recursive --force /', 'rm -f -r -- /']) {
  assert.match(checkToolCall(rules, 'Bash', { command }, cwd) ?? '', /^Command blocked by policy/, command);
}
for (const command of ['rm -r build', 'rm -rf ./dist', 'rm -f notes.txt']) {
  assert.equal(checkToolCall(rules, 'Bash', { command }, cwd), undefined, command);
}
```
(`rules` here must carry `denyCommands: DEFAULT_DENY_COMMANDS`; use or extend the file's existing rules object.)

- [ ] **Step 2: Run** `node --test packages/core/test/guard.test.ts` → the new test FAILS on `rm -r -f /`.
- [ ] **Step 3: Replace the `rm` regex** so any run of option words (`-x…` or `--word`, including a bare `--`) may sit before and after the recursive flag (`-…r…`, `-…R…` or `--recursive`), followed by `/`, `~` or `..`.
- [ ] **Step 4: Run** the same command plus `pnpm -s typecheck:packages` → all pass.
- [ ] **Step 5: Commit** `fix(core): block recursive rm of /, ~ or .. with split or long flags`.

---

### Task 2: `folder` and `plugins` resolve to their real paths

**Files:** Modify `packages/cli/src/config.ts`. Test `packages/cli/test/config.test.ts`.

**Interfaces:** after the existing directory checks pass, `spec.cwd`, `guards.writeRoots[0]` and each `plugin_dir` path are `realpathSync` of the resolved path. `skills:` paths stay as resolved (they are copied).

- [ ] **Step 1: Write the failing tests**

```ts
test('a folder reached through a link resolves to its real path', () => {
  // real = mkdtempSync(...); base has `link` → symlinkSync(real, join(base, 'link')); YAML folder: link
  // → spec.cwd === realpathSync(real); spec.guards.writeRoots deepEqual [realpathSync(real)]
});
test('a plugin reached through a link resolves to its real path', () => { /* same, plugins: [plink] → capabilities[0].mount.path === realpathSync(target) */ });
test('a missing folder is still a plain error line', () => { /* folder: nope → ['task.yaml: folder: not a directory: <abs>'] — already passes; keep it as a guard */ });
```

- [ ] **Step 2: Run** `node --test packages/cli/test/config.test.ts` → the two link tests FAIL.
- [ ] **Step 3: Implement** in `loadConfig`: `realpathSync` only after `isDir` succeeded.
- [ ] **Step 4: Run** the same + typecheck → pass.
- [ ] **Step 5: Commit** `fix(cli): resolve folder and plugin links, so /tmp paths are not blocked by the write guard`.

---

### Task 3: OpenCode asks before reading `.env` files

**Files:** Modify `packages/adapters/src/agent/opencode/permissions.ts` (`toPermissionRules`). Test `packages/adapters/test/opencode-permissions.test.ts`.

**Interfaces:** rule order becomes: base (ask-all + read-only allows, or allow-all under `bypassPermissions`) → `allow` list → **`.env` rules** → `deny` list → tool servers → `question` deny. The `.env` rules: `{ permission: 'read', pattern: '*.env', action: 'ask' }`, `{ permission: 'read', pattern: '*.env.*', action: 'ask' }`, `{ permission: 'read', pattern: '*.env.example', action: 'allow' }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('reading .env files asks, .env.example stays allowed', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { allow: ['Read'], deny: ['Read(secret.env)'] } });
  const i = (p: string, pattern: string) => rules.findIndex((r) => r.permission === p && r.pattern === pattern);
  // .env rules come after the allow list's read * and before the deny list
  assert.ok(i('read', '*') < i('read', '*.env') && i('read', '*.env.example') < i('read', 'secret.env'));
  assert.deepEqual(rules[i('read', '*.env')].action, 'ask');
  assert.deepEqual(rules[i('read', '*.env.*')].action, 'ask');
  assert.deepEqual(rules[i('read', '*.env.example')].action, 'allow');
});
```
Update `'maps the tool policy after the defaults'`: the allow entries and the deny entry are no longer adjacent; assert them by `find`, and that the deny comes after the `.env` rules. Record the change as a ruling.

- [ ] **Step 2: Run** `node --test packages/adapters/test/opencode-permissions.test.ts` → the new test FAILS.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same + `node --test packages/adapters/test/opencode-options.test.ts` (the config form of the rules) + typecheck → pass.
- [ ] **Step 5: Commit** `fix(opencode): ask before reading .env files, as OpenCode does by default`.

---

### Task 4: OpenCode subagents get the step limit; a late server error is handled

**Files:** Modify `packages/adapters/src/agent/opencode/options.ts`, `packages/adapters/src/agent/opencode/server.ts`. Tests `packages/adapters/test/opencode-options.test.ts`, `packages/adapters/test/opencode-provider.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// opencode-options.test.ts
test('the step limit applies to every agent', () => {
  const { config } = buildLaunch(spec, base); // spec.limits.maxTurns === 5
  for (const a of ['build', 'plan', 'general', 'explore']) assert.equal((config.agent as any)[a].steps, 5, a);
});
// opencode-provider.test.ts (uses the fake server)
test('a server error after start-up does not throw', async () => {
  // startServer(hostExecHost, { opencodePath: FAKE, cwd, env }) → assert.doesNotThrow(() => server.child.emit('error', new Error('late'))); then kill the child
});
```
Update the existing `'maps tools, skills, turns and guards into config'` assertion on `config.agent` to the four agents.

- [ ] **Step 2: Run** both files → the two new tests FAIL (`emit('error')` throws with no listener).
- [ ] **Step 3: Implement**: `config.agent` with `{ steps }` for the four agents; in `startServer`, keep an `error` listener for the child's whole life once started (append to the stderr tail, so the run's error message carries it).
- [ ] **Step 4: Run** both files + typecheck → pass.
- [ ] **Step 5: Commit** `fix(opencode): limit subagent steps too; handle a server error after start-up`.

---

### Task 5: `SIGKILL` after a grace period, on both providers

**Files:** Modify `packages/adapters/src/agent/claude/provider.ts`, `packages/adapters/src/agent/opencode/provider.ts`. Create `packages/adapters/test/fixtures/fake-claude/ignore-term.sh` (`trap '' TERM`, then loop on `sleep 1`). Modify `packages/adapters/test/fixtures/fake-opencode.mjs` (`FAKE_IGNORE_TERM=1` → `process.on('SIGTERM', () => {})`). Tests `packages/adapters/test/claude-sdk.test.ts`, `packages/adapters/test/opencode-provider.test.ts`.

**Interfaces:** both constructors take `killGraceMs?: number` (default `5000`). Wherever a provider sends `SIGTERM` to its child, it also starts an `unref()`ed timer that sends `SIGKILL` after `killGraceMs` unless the child has exited by then.

- [ ] **Step 1: Write the failing tests**

```ts
// claude-sdk.test.ts
test('stop() kills a CLI that ignores SIGTERM', { timeout: 5_000 }, async () => {
  const run = new ClaudeCodeProvider({ claudePath: fake('ignore-term.sh'), killGraceMs: 200 }).launch(spec);
  await run.pid; await new Promise((r) => setTimeout(r, 100));
  run.stop();
  assert.equal((await run.result).error, 'stopped');
});
// opencode-provider.test.ts
test('a server that ignores SIGTERM is killed after the grace period', { timeout: 5_000 }, async () => {
  // setup([step(0.01), idle], { FAKE_IGNORE_TERM: '1' }); provider with killGraceMs: 200 → result settles exitCode 0;
  // the fake's pid (serverPid()) is no longer alive: assert.throws(() => process.kill(pid, 0))
});
test('a server that exits on SIGTERM is not sent SIGKILL', async () => {
  // normal fake; spy: wrap hostExecHost.spawn to record child.kill calls → kill signals deepEqual ['SIGTERM']
});
```

- [ ] **Step 2: Run** `node --test packages/adapters/test/claude-sdk.test.ts packages/adapters/test/opencode-provider.test.ts` → the two ignore-TERM tests FAIL by timeout.
- [ ] **Step 3: Implement.** Claude: in `spawnClaudeCodeProcess`'s abort listener. OpenCode: in the cleanup `finally`, and in `startServer`'s start-up timeout kill.
- [ ] **Step 4: Run** the same + the whole adapters suite + typecheck → pass.
- [ ] **Step 5: Commit** `fix(adapters): SIGKILL a child that ignores SIGTERM after a grace period`.

---

### Task 6: Setup failures are error lines, not stack traces

**Files:** Modify `packages/cli/src/config.ts`, `packages/cli/src/run.ts`. Tests `packages/cli/test/config.test.ts`, `packages/cli/test/run.test.ts`.

| Failure | Where | Output | Exit |
|---|---|---|---|
| prompt file exists but cannot be read | `loadConfig` | `task.yaml: prompt: cannot read: <error message>` | 2 |
| `runs` cannot be created or the log cannot be opened (e.g. `runs` is a file) | `runAgent`, before anything else is set up | `task.yaml: runs: cannot create the log: <error message>` (via `printErr`) | 2 |
| temp dir, broker, or skills copy fails | `runAgent`, after the log is open | the setup-failure result (Global Constraints), printed and logged | 1 |

- [ ] **Step 1: Write the failing tests** (skip the permission-based ones when `process.getuid?.() === 0`):

```ts
test('an unreadable prompt file is an error line', () => { /* chmodSync(task.md, 0o000) → ['task.yaml: prompt: cannot read: …'] (match /^task\.yaml: prompt: cannot read: /) */ });
test('runs existing as a file is an error line and exit 2', async () => { /* writeFileSync(join(base,'runs'),'') → code 2; err[0] matches /^task\.yaml: runs: cannot create the log: / */ });
test('a skills folder that cannot be copied fails the run with a result', async () => {
  // skills/grill-me/SKILL.md valid + skills/grill-me/locked.md chmod 0o000 → code 1;
  // last log line is a result whose error starts 'cannot set up the run: '; out's last line starts '-- result '
});
test('an unreadable prompt creates no runs/ log', async () => { /* via runAgent: code 2, !existsSync(join(base, 'runs')) */ });
```

- [ ] **Step 2: Run** `node --test packages/cli/test/config.test.ts packages/cli/test/run.test.ts` → the new tests FAIL (thrown errors).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm -s typecheck:packages && pnpm -s test:packages` → `fail 0`.
- [ ] **Step 5: Commit** `fix(cli): report setup failures as error lines instead of stack traces`.

---

### Task 7: Docs

**Files:** Modify `docs/FlowBoard/Agent Providers/Run Config Reference.md`, `Run Agent CLI Decisions.md`, `Provider Implementation Decisions.md`, `OpenCode Adapter.md`.

- [ ] **Step 1:** Reference, *Asking the owner*: "pick one: … or type the option's number" → "…or type the option's number, then Enter". Decisions R27 likewise ("option numbers move the cursor; Enter confirms").
- [ ] **Step 2:** Decisions notes: remove the eight fixed rows from the deferred tables and add one decision row per fix (next free `R`/`C`/`O` numbers), each with *why* and *cost if wrong*; record the `/tmp` link item as found in the 2026-10-18 test run. `OpenCode Adapter.md`: add the `.env` rules to the `toolPolicy, permissionMode` row and the four agents to the `limits.maxTurns` row.
- [ ] **Step 3: Run** `pnpm -s test:packages` → still `fail 0` (docs only).
- [ ] **Step 4: Commit** `docs: record the group-1 fixes`.
