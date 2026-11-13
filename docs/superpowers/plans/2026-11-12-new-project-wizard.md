# New Project Wizard Implementation Plan (phases 1–2: the wizard on `gh`, and the settings model)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a project means the wizard in `docs/mockups/new-project-wizard.html`: pick a type, pick a GitHub repo
through the installed `gh` login, set the project's settings over the app's (each showing where its value comes from),
then clone and register it. The project page edits the same settings pages afterwards.

**Architecture:** Three server modules in `packages/cli/src`: `settings.ts` (app settings in `data/settings.json`,
project types, override validation, precedence resolution), `github.ts` (every `gh` call, binary injectable for tests)
and `clone.ts` (target folder, an in-memory clone job that registers the project when git finishes). The registry
(`projects.ts`) grows `type`, `source` and `overrides`. The UI is one wizard dialog plus a shared settings-pages
component used by the wizard, the project page and a new `/settings` page.

**Tech Stack:** Next 16 App Router (`cacheComponents` on; read `node_modules/next/dist/docs/` first), shadcn/ui
(radix-nova, `components/ui/`), TanStack Query + Form, zod 4, Lucide icons, `node --test` with type stripping.

**Spec:** `docs/mockups/new-project-wizard.html` (open it and click through), its entry in `docs/mockups/README.md`,
and the handoff decisions copied into Global Constraints below.

**Not in this plan (one plan each, written when reached, after reading their vault notes):** 3. sandbox tier and
project budget enforced in run-flow; 4. the analysis agent and its proposals (check command, network hosts); 5. knowledge
assets (Serena, graphify, rebuilds); 6. escalation to Slack; 7. memory. This plan stores and shows those settings; it
does not act on them. The clone view ends at "registered" and the proposals panel arrives with plan 4.

## Global Constraints

- All paths below are under `code/flowboard/` unless they start with `docs/`. Run commands from `code/flowboard/`.
- Branch `feature/projects-impl`; do not merge into `dev`.
- Pin new dependencies to exact versions at least two weeks old. Expected: none needed (shadcn components are added
  with `pnpm dlx shadcn@4.23.0 add <name>`, which only writes into `components/ui/`).
- Light only, zero border-radius, house tokens from `app/globals.css`; icons from `lucide-react`.
- Keep shadcn UI outside `.fd` (`app/flows/flows.css` resets `button` there without a layer).
- Close any Radix dialog before `router.push`; scope Playwright locators to `main:visible`.
- GitHub = the installed `gh` CLI and its login. No tokens stored by FlowBoard, no OAuth app of our own.
- Fixed by the repo, never asked: name = repo name; slug = `slugify(name)`, or `slugify(owner-name)` when taken, then
  numbered (`-2`) if that is taken too; base branch = GitHub's default branch; flows = the type's flows; check command =
  proposed after cloning (plan 4), never asked in the wizard.
- Software type: flows `delivery`, `review-loop`; defaults trust `normal`, knowledge `{ serena: true, graphify: true,
  rebuild: 'push' }`. Research, Writing, Data: shown, "coming soon", disabled. Sources: GitHub enabled; GitLab,
  Bitbucket, Azure Repos, "A folder on this machine": "coming soon".
- App defaults (the mockup's `APP`, minus its demo values): `projectsFolder: null`, `trust: 'normal'`,
  `budget: { capUsd: null, alertAt: 80, onLimit: 'pause' }`, `escalation: { channel: '#flowboard', nudgeMin: 5 }`,
  `memory: false`, `knowledge: { serena: false, graphify: false, rebuild: 'manual' }`, `draft: false`.
- Precedence app → type → project (flow and step levels come with plan 3). Presence of a key in `overrides` = overridden.
- Storage split: limits and check command in the repo's `.flowboard.yaml`; trust, budget, escalation, memory,
  knowledge, draft in the project record. A repo's `.flowboard.yaml` can never set trust, network or budget.
- Validation messages, verbatim from the mockup: cap `a dollar amount above 0`; alertAt `alert at 1 to 100 percent`;
  channel `a Slack channel, like #billing-alerts` (regex `^#[a-z0-9][a-z0-9_-]*$`); nudge `1 to 120 minutes`;
  memoryMb `a whole number of MB, 64 or more`; cpus `more than 0; 1.5 is a CPU and a half`; clone folder
  `a folder path: absolute, or starting with ~/`.
- Clone destination: `app.projectsFolder ?? ~/FlowBoard/projects`, or a folder for this project only; optionally saved
  as the new `projectsFolder`. `<parent>/<name>` that exists and is not empty → `<name>-2`, `-3`, …
- Every copy string not listed here: take it from the mockup.

## Decisions this plan makes (for Alex's review)

1. A project runs its type's flows from the library as they are; no per-project copies. `defaultFlow` stays on the
   record, set to the type's first flow, so `/runs?new=` and the project page keep working. `flowType` and
   `startFlow` go.
2. "Use another account" = `gh auth switch --user <login>` when `gh` holds more than one account for github.com;
   otherwise the page says to run `gh auth login` in a terminal, with a "Check again" button. "Reconnect" (token
   rejected) shows `gh auth refresh -h github.com` the same way. A web server cannot drive `gh`'s interactive login.
3. "Request access" for a restricted org opens `https://github.com/settings/connections/applications/178c6fc778ccc68e1d6a`
   (the GitHub CLI's OAuth app, where GitHub offers "Request" per org); "Check again" refetches.
4. Clone jobs live in the Next server's memory (on `globalThis`, so dev reloads keep them). A restart mid-clone loses
   the job; the wizard says so.
5. "Used before" folders are the parent folders of existing projects' repos; nothing new is stored.
6. graphify's cost per rebuild is an estimate from GitHub's `diskUsage`: `max(0.05, MB × 0.008)` dollars, shown as
   "about". Plan 5 replaces it with metered figures.
7. Old records without `type` read as `software`, without `source` as `{ kind: 'local' }`, without `overrides` as `{}`.

## Review Focus

1. **`gh` missing, signed out, or its token rejected** → step 3 shows the connect or Reconnect box with the command to
   run, never a 500 or an empty list. Tests: Task 4 `status: missing, signed out, rejected`.
2. **An org that restricts OAuth apps** → its owner button says "no access" and the panel explains it; not "no
   repositories". Test: Task 4 `repos: a restricted org says so`.
3. **Destination already taken, repo already a project, or Clone pressed twice** → `-2` folder; repo row disabled
   "already the project X" and a 409 from the server; the second clone of a repo in flight is a 409. Tests: Task 5.
4. **A cloned repo whose `.flowboard.yaml` names `trust`, `network` or `budget`** → the file is reported as invalid on
   the project, and the record's settings are untouched. Test: Task 3.
5. **Name and owner-name slug both taken** → numbered slug, never a 409. Test: Task 3.

---

### Task 1: Settings model

**Files:**
- Create: `packages/cli/src/settings.ts`
- Test: `packages/cli/test/settings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Trust = 'trusted' | 'normal' | 'untrusted';
  export interface Budget { capUsd: number | null; alertAt: number; onLimit: 'pause' | 'ask' }
  export interface Escalation { channel: string; nudgeMin: number }
  export interface Knowledge { serena: boolean; graphify: boolean; rebuild: 'push' | 'daily' | 'manual' }
  export interface Settings { trust: Trust; budget: Budget; escalation: Escalation; memory: boolean; knowledge: Knowledge; draft: boolean }
  export type SettingKey = keyof Settings;
  export interface AppSettings extends Settings { projectsFolder: string | null }
  /** A project's own values; in an override, budget.capUsd is a number > 0. */
  export type Overrides = Partial<Settings>;
  export type ProjectTypeId = 'software' | 'research' | 'writing' | 'data';
  export interface ProjectType { id: ProjectTypeId; name: string; text: string; flows: string[]; defaults: Partial<Settings>; soon?: true }
  export const PROJECT_TYPES: Record<ProjectTypeId, ProjectType>;
  export const APP_DEFAULTS: AppSettings;
  export const OverridesSchema: z.ZodType<Overrides>;   // strict; messages as in Global Constraints
  export const AppSettingsSchema: z.ZodType<AppSettings>;
  export function readAppSettings(dataDir: string): AppSettings;          // defaults merged under the file
  export function updateAppSettings(dataDir: string, edit: Partial<AppSettings>): Result<AppSettings>; // 400 + message
  export type From = 'app' | 'type' | 'project';
  export type Resolved = { [K in SettingKey]: { value: Settings[K]; from: From } };
  export function resolveSettings(app: AppSettings, type: ProjectTypeId, ov: Overrides): Resolved;
  export const DEFAULT_PROJECTS_FOLDER = '~/FlowBoard/projects';
  ```
  `Result` is imported from `projects.ts` with `import type` (projects.ts imports settings.ts). Types are plain TS so `app/` can import them (`import type`), as
  `app/projects/api.ts` does today.

- [ ] **Step 1: Write the failing tests**

```ts
test('app settings: defaults with no file, an edit is kept, a bad value is refused with why', () => {
  const data = temp();
  assert.deepEqual(readAppSettings(data), APP_DEFAULTS);
  value(updateAppSettings(data, { projectsFolder: '~/code', budget: { capUsd: 200, alertAt: 75, onLimit: 'ask' } }));
  assert.equal(readAppSettings(data).projectsFolder, '~/code');
  assert.equal(readAppSettings(data).budget.capUsd, 200);
  assert.equal(readAppSettings(data).trust, 'normal'); // untouched keys keep their defaults
  assert.deepEqual(updateAppSettings(data, { escalation: { channel: 'billing', nudgeMin: 5 } }), { ok: false, status: 400, error: 'a Slack channel, like #billing-alerts' });
});

test('precedence: app, then the type, then the project; each value says where it came from', () => {
  const app = { ...APP_DEFAULTS, draft: true };
  const r = resolveSettings(app, 'software', { budget: { capUsd: 150, alertAt: 80, onLimit: 'pause' } });
  assert.deepEqual(r.trust, { value: 'normal', from: 'type' });
  assert.deepEqual(r.knowledge, { value: { serena: true, graphify: true, rebuild: 'push' }, from: 'type' });
  assert.deepEqual(r.budget, { value: { capUsd: 150, alertAt: 80, onLimit: 'pause' }, from: 'project' });
  assert.deepEqual(r.draft, { value: true, from: 'app' });
  assert.deepEqual(resolveSettings(app, 'software', { trust: 'untrusted' }).trust, { value: 'untrusted', from: 'project' });
});

test('overrides: every rule the wizard checks, with its message', () => {
  const bad = (ov: unknown) => OverridesSchema.safeParse(ov).error?.issues[0].message;
  assert.equal(bad({ budget: { capUsd: 0, alertAt: 80, onLimit: 'pause' } }), 'a dollar amount above 0');
  assert.equal(bad({ budget: { capUsd: 5, alertAt: 101, onLimit: 'pause' } }), 'alert at 1 to 100 percent');
  assert.equal(bad({ escalation: { channel: '#ok', nudgeMin: 121 } }), '1 to 120 minutes');
  assert.ok(bad({ network: ['x'] })); // strict: nothing outside Settings
  assert.equal(OverridesSchema.safeParse({ memory: true, draft: false }).success, true);
});
```

- [ ] **Step 2: Run** `node --test packages/cli/test/settings.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `settings.ts`.** File = `join(dataDir, 'settings.json')`, written with the tmp-then-rename
  pattern of `writeProjects` (`projects.ts:33`); a nested edit replaces that whole key. App `budget.capUsd` may be null;
  override `capUsd` must be > 0. `resolveSettings`: per key, override if present, else `PROJECT_TYPES[type].defaults[k]`,
  else app.

- [ ] **Step 4: Run** the test file — Expected: PASS. Then `pnpm typecheck:packages` — Expected: no errors.

- [ ] **Step 5: Commit** `feat(settings): app settings, project types and precedence`

---

### Task 2: Limits written to the repo's `.flowboard.yaml`

**Files:**
- Modify: `packages/cli/src/project.ts` (beside `setCheckCommand`, `:44-60`)
- Test: `packages/cli/test/projects.test.ts`

**Interfaces:**
- Produces: `export function setLimits(folder: string, limits: Limits): { ok: true } | { ok: false; errors: string[] }`
  — sets `sandbox.memory_mb` / `sandbox.cpus`, deletes those absent, removes an emptied `sandbox:`, keeps other keys
  and comments, removes a file left `{}` (share that tail with `setCheckCommand`).

- [ ] **Step 1: Write the failing tests**

```ts
test('limits go into the repo file next to the check command, and an empty one is removed', () => {
  const r = repo();
  value(asResult(setCheckCommand(r, 'node --test')));
  value(asResult(setLimits(r, { memoryMb: 2048, cpus: 1.5 })));
  assert.deepEqual(projectSettings(r), { ok: true, settings: { limits: { memoryMb: 2048, cpus: 1.5 }, checkCommand: 'node --test' } });
  value(asResult(setLimits(r, {})));
  value(asResult(setCheckCommand(r, undefined)));
  assert.equal(existsSync(join(r, '.flowboard.yaml')), false);
});

```
  (`asResult` maps `{ok:false, errors}` to `{ok:false, error: errors.join('\n')}` for `value`; add it to the test file.)

- [ ] **Step 2: Run** `node --test packages/cli/test/projects.test.ts` — Expected: FAIL (`setLimits` not exported).

- [ ] **Step 3: Implement `setLimits`.**

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(project): write sandbox limits to .flowboard.yaml`

---

### Task 3: The record: type, source, overrides

**Files:**
- Modify: `packages/cli/src/projects.ts`, `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`,
  `app/projects/api.ts`
- Test: `packages/cli/test/projects.test.ts`

**Interfaces:**
- Consumes: Task 1 `ProjectTypeId`, `PROJECT_TYPES`, `Overrides`, `OverridesSchema`, `resolveSettings`, `Resolved`.
- Produces:
  ```ts
  export type Source = { kind: 'github'; repo: string /* owner/name */ } | { kind: 'local' };
  export interface Project { id; name; slug; repoPath; defaultFlow: string | null; baseBranch: string | null; createdAt;
    type: ProjectTypeId; source: Source; overrides: Overrides }
  export interface NewProject { name: string; repoPath: string; type: ProjectTypeId; source?: Source; slug?: string;
    owner?: string /* the slug falls back to owner-name */; overrides?: Overrides; limits?: Limits }
  export interface ProjectEdit { name?; defaultFlow?; checkCommand?; baseBranch?; overrides?: Overrides; limits?: Limits }
  export interface ProjectView extends Project { checkCommand: string | null; limits: Limits; settings: Resolved; problems; runs; weekSpendUsd }
  export function projectSlug(projects: Project[], name: string, owner?: string): string;
  export function readProjects(dataDir: string): Project[]; // fills type/source/overrides on old records
  ```
  `viewProjects` gains an `app: AppSettings` parameter (last before `now`) to fill `settings`.

- [ ] **Step 1: Write the failing tests** (rewrite the existing `defaultFlow`/`flowType` cases to the new input)

```ts
test('a project gets its type: the type’s first flow, its source, and no overrides unless given', () => {
  const data = temp();
  const p = value(createProject(data, flows(), { name: 'api', repoPath: repo(), type: 'software', source: { kind: 'github', repo: 'flowboard/api' } }));
  assert.deepEqual([p.type, p.defaultFlow, p.source, p.overrides], ['software', 'delivery', { kind: 'github', repo: 'flowboard/api' }, {}]);
  assert.deepEqual(createProject(data, flows(), { name: 'x', repoPath: repo(), type: 'research' }), { ok: false, status: 400, error: 'Research projects are coming soon' });
});

test('the slug: the name, else owner-name, else numbered; never a 409 for a clash', () => {
  const data = temp();
  const make = () => value(createProject(data, flows(), { name: 'web', owner: 'flowboard', repoPath: repo(), type: 'software' })).slug;
  assert.deepEqual([make(), make(), make()], ['web', 'flowboard-web', 'flowboard-web-2']);
});

test('overrides and limits: kept on create, changed on edit, refused when invalid', () => {
  const data = temp();
  const r = repo();
  const p = value(createProject(data, flows(), { name: 'a', repoPath: r, type: 'software', overrides: { trust: 'untrusted' }, limits: { memoryMb: 1024 } }));
  assert.deepEqual(p.overrides, { trust: 'untrusted' });
  assert.deepEqual(projectLimits(r), { ok: true, limits: { memoryMb: 1024 } });
  assert.deepEqual(value(updateProject(data, flows(), p.id, { overrides: {} })).overrides, {});
  assert.deepEqual(updateProject(data, flows(), p.id, { overrides: { budget: { capUsd: -1, alertAt: 80, onLimit: 'pause' } } }), { ok: false, status: 400, error: 'a dollar amount above 0' });
});

test('a repo cannot grant itself trust, network or budget: its file is refused, the record is not touched', () => {
  const r = repo();
  writeFileSync(join(r, '.flowboard.yaml'), 'trust: trusted\nnetwork: [evil.example]\nbudget_usd: 1000\n');
  const s = projectSettings(r);
  assert.equal(s.ok, false);
  const p = value(createProject(temp(), flows(), { name: 'R', repoPath: r, type: 'software' }));
  assert.deepEqual(p.overrides, {});
});

test('a record from before types reads as a local software project with nothing overridden', () => { /* write a projects.json without the keys; readProjects fills them */ });
```
  Also: `viewProjects(..., APP_DEFAULTS)` returns `settings.trust.from === 'type'` and `limits` from the repo file.

- [ ] **Step 2: Run** `node --test packages/cli/test/projects.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `flowType`, `startFlow` and the `defaultFlow` input. `defaultFlow` = the type's
  first flow that exists in the library, else null. Validate `overrides` with `OverridesSchema` (first issue's message,
  400) and write `limits` with `setLimits` before writing the record. `seedOnce` passes `type: 'software'`. Routes: zod
  `Create`/`Edit` take the new fields (`overrides` as `z.unknown()`, validated in `projects.ts`); GET passes
  `readAppSettings(dataDir())`. Update `app/projects/project.tsx` callers so it type-checks; the new UI is Task 6.

- [ ] **Step 4: Run** the file, then `pnpm test:packages` — Expected: PASS except the known
  `flow-start.test.ts` "a run started from the page is named…" failure.

- [ ] **Step 5: Commit** `feat(projects): projects have a type, a source and their own overrides`

---

### Task 4: GitHub through `gh`

**Files:**
- Create: `packages/cli/src/github.ts`, `app/api/github/route.ts`, `app/api/github/repos/route.ts`,
  `app/api/github/switch/route.ts`
- Test: `packages/cli/test/github.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GhStatus =
    | { state: 'connected'; login: string; accounts: string[] }   // accounts: every login gh holds for github.com
    | { state: 'missing' }                                         // gh not installed
    | { state: 'signed-out' }
    | { state: 'rejected'; login: string; message: string };       // gh auth status fails for the active account
  export function ghStatus(gh?: string): GhStatus;                  // `gh auth status --json hosts`
  export function ghOwners(gh?: string): { ok: true; owners: string[] } | { ok: false; error: string };
    // [the login, ...`gh api user/memberships/orgs?state=active --paginate --jq .[].organization.login`]
  export interface GhRepo { owner: string; name: string; description: string; language: string | null; pushedAt: string;
    private: boolean; defaultBranch: string; sizeKb: number }
  export function ghRepos(owner: string, gh?: string):
    | { ok: true; repos: GhRepo[] }
    | { ok: false; reason: 'restricted' | 'error'; error: string };
    // `gh repo list <owner> --limit 1000 --json name,description,primaryLanguage,pushedAt,isPrivate,defaultBranchRef,diskUsage`
    // restricted: gh's error mentions "OAuth App access restrictions"
  export function ghSwitch(login: string, gh?: string): { ok: true } | { ok: false; error: string };
  export const GH_REQUEST_ACCESS_URL = 'https://github.com/settings/connections/applications/178c6fc778ccc68e1d6a';
  ```
  `gh` defaults to `'gh'`. Routes: `GET /api/github` → `{ status, owners? }` (owners only when connected);
  `GET /api/github/repos?owner=` → the `ghRepos` result plus `taken: Record<string /*owner/name*/, string /*project name*/>`
  from records with a github source; `POST /api/github/switch { login }`. All behind `refused()`. Validate `owner`
  and `login` against `^[A-Za-z0-9-]+$` before passing them to `gh` (400 otherwise).

- [ ] **Step 1: Write the failing tests.** A helper writes a fake `gh` (`#!/bin/sh` + `case "$*" in … esac`) into a temp
  folder, chmod 755, and returns its path.

```ts
test('status: connected, with every account gh holds', () => { /* hosts JSON with two entries, one active → { state:'connected', login:'alex', accounts:['alex','alex-work'] } */ });
test('status: missing, signed out, rejected', () => {
  assert.deepEqual(ghStatus('/nonexistent/gh'), { state: 'missing' });
  // fake printing {"hosts":{}} → { state: 'signed-out' }
  // fake printing an entry with "state":"error","error":"token expired" and exiting 1 → { state:'rejected', login, message:'token expired' }
});
test('repos: listed with their default branch and size', () => { /* fake JSON row → GhRepo with defaultBranch 'trunk', sizeKb 27000 */ });
test('repos: a restricted org says so', () => {
  // fake writes "GraphQL: Although you appear to have the correct authorization credentials, the `partner-co` organization has enabled OAuth App access restrictions" to stderr, exit 1
  assert.equal(ghRepos('partner-co', fake).reason, 'restricted');
});
test('a bad owner never reaches gh', () => { /* route-level: GET /api/github/repos?owner=--help → 400; test via a tiny exported `ownerOk` */ });
```

- [ ] **Step 2: Run** `node --test packages/cli/test/github.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `spawnSync(gh, args, { encoding: 'utf8', timeout: 30_000 })`, never a shell. Before
  writing the parser, run the real `gh auth status --json hosts` once with a bad token in a throwaway `GH_CONFIG_DIR`
  to confirm the `error` field's name; record the real shape in the fake.
- [ ] **Step 4: Run** — Expected: PASS. Then `curl -s localhost:3117/api/github` against the dev server (see Task 9)
  shows `connected` as `alextiboldi` with ClearCloudSoftware and VibeStackStudio.
- [ ] **Step 5: Commit** `feat(github): repos and accounts through the gh CLI login`

---

### Task 5: Clone and register

**Files:**
- Create: `packages/cli/src/clone.ts`, `app/api/projects/clone/route.ts`, `app/api/projects/clone/[job]/route.ts`
- Test: `packages/cli/test/clone.test.ts`

**Interfaces:**
- Consumes: Task 1 `readAppSettings`, `updateAppSettings`, `DEFAULT_PROJECTS_FOLDER`; Task 3 `createProject`,
  `readProjects`; Task 2 limits via `NewProject.limits`.
- Produces:
  ```ts
  /** `<parent>/<name>`, or `-2`, `-3`… past a folder that exists and holds something. `~/` expanded. */
  export function cloneTarget(parent: string, name: string): string;
  /** Parent folders of existing projects' repos, newest first, without duplicates or the default. */
  export function recentParents(projects: Project[], exclude: string): string[];
  export interface CloneInput { repo: string /* owner/name */; type: ProjectTypeId; parent: string; makeDefault: boolean;
    overrides: Overrides; limits: Limits }
  export interface CloneJob { id: string; repo: string; folder: string; phase: 'cloning' | 'setting up' | 'done' | 'failed';
    pct: number; lines: string[]; project?: Project; error?: string }
  export function startClone(dataDir: string, flowsDir: string, input: CloneInput, gh?: string): Result<CloneJob>;
  export function cloneJob(id: string): CloneJob | undefined;
  ```
  `POST /api/projects/clone` → 201 `CloneJob` or 400/409; `GET /api/projects/clone/<id>` → `CloneJob` or 404.

- [ ] **Step 1: Write the failing tests.** The fake `gh` for `repo clone` runs `git clone <a local bare repo> "$4"`
  and echoes `Receiving objects:  50% (1/2)` to stderr first.

```ts
test('the target: the repo name in the parent, -2 when that holds something, an empty folder is used', () => {
  const parent = temp();
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web'));
  mkdirSync(join(parent, 'web'));
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web'));
  writeFileSync(join(parent, 'web', 'x'), '');
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web-2'));
});

test('a clone registers the project when git is done, with its overrides, and can save the parent as the default', async () => {
  const job = value(startClone(data, lib, { repo: 'flowboard/api', type: 'software', parent, makeDefault: true, overrides: { draft: true }, limits: {} }, fakeGh));
  const done = await until(() => cloneJob(job.id)!.phase === 'done');
  assert.deepEqual([done.project!.source, done.project!.overrides, done.project!.baseBranch], [{ kind: 'github', repo: 'flowboard/api' }, { draft: true }, 'main']);
  assert.equal(readAppSettings(data).projectsFolder, parent);
  assert.ok(done.lines.some((l) => l.includes('registered at /p/api')));
});

test('refused before cloning: a repo already a project, one being cloned, a bad repo name, a relative folder, bad overrides', () => {
  // 409 'flowboard/api is already the project api'; 409 'flowboard/api is being cloned'; 400 for 'a/--upload-pack=x';
  // 400 'a folder path: absolute, or starting with ~/'; 400 'a dollar amount above 0'
});

test('a failed clone says why and registers nothing', async () => { /* fake exits 128 with "repository not found" → phase failed, error has the stderr tail, readProjects empty */ });
```

- [ ] **Step 2: Run** `node --test packages/cli/test/clone.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Repo name must match `^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$`. Spawn
  `gh repo clone <repo> <folder> -- --progress` (async `spawn`); split stderr on `\r` and `\n`, replace the last line
  while it starts with the same git phase word, take `pct` from `Receiving objects: NN%`. On exit 0: `excludeFromGit`,
  `createProject({ name, owner, repoPath: folder, type, source, overrides, limits })`, `makeDefault` →
  `updateAppSettings({ projectsFolder: parent })`, then push the mockup's `-- …` lines (`added .flowboard/ to
  .git/info/exclude`, `project X registered at /p/slug: Software, Normal: container`, the overrides line, and
  `wrote .flowboard.yaml: sandbox limits …` when limits were given). Jobs in `globalThis.__fbClones ??= new Map()`;
  mark it `ponytail:` with the restart ceiling.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): clone a GitHub repo and register it`

---

### Task 6: Settings pages, shared; the project page grows them

**Files:**
- Create: `app/projects/settings-pages.tsx`, `app/api/settings/route.ts` (GET, PATCH)
- Modify: `app/projects/api.ts`
- Modify: `app/projects/project.tsx` (replace its flow select with the type's flows read-only; add the pages)

**Interfaces:**
- Consumes: Task 1 types, Task 3 `ProjectView.settings`, `limits`, Task 4 `ghStatus`.
- Produces: `GET /api/settings` → `{ app: AppSettings; machine: { os: NodeJS.Platform }; github: GhStatus; recentFolders: string[] }`
  (`recentFolders` arrives with Task 5's `recentParents`; until then `[]`); `PATCH /api/settings` (partial
  `AppSettings`) → `AppSettings` or 400. In `api.ts`: `appSettingsQuery`, `updateAppSettings(edit)`. And:
  ```ts
  export const SETTING_PAGES: { id: 'overview' | 'sandbox' | 'network' | 'budget' | 'escalation' | 'memory' | 'knowledge' | 'draft';
    title: string; key?: SettingKey; intro: string }[];      // titles and intros verbatim from the mockup's SUBS
  export interface Draft { overrides: Overrides; limits: { memoryMb: string; cpus: string } }   // limits as typed text
  export function problems(d: Draft, resolved: Resolved, ctx: { os: string; flows: string[]; repo?: { name: string; branch: string; sizeKb: number } }):
    { errors: Partial<Record<string, string>>; warns: { page: string; text: string; caution?: true }[] };
  export function SettingPage(props: { page: string; draft: Draft; onChange(d: Draft): void; resolved: Resolved; ctx; mode: 'project' | 'app' }): JSX.Element;
  ```
  Behaviour copied from the mockup: `setting()` (from-label, "override" switch, inherited text until on), `toggle()`
  (turning an override on starts it from the inherited value), `summary`, the warnings in `problems()` (trusted →
  approval warning; untrusted on `os !== 'linux'` → the gVisor fallback text; graphify cost with Decision 6's estimate;
  no maps → the tokens warning). Network page is static text in this plan.

- [ ] **Step 1: Write the failing test** `app/projects/settings-pages.test.ts` (run by `pnpm test:app`) for `problems`:
  limits `63` → `a whole number of MB, 64 or more`; cpus `0` → `more than 0; 1.5 is a CPU and a half`; untrusted with
  `os: 'darwin'` → the gVisor warning, with `os: 'linux'` → none; graphify on with `sizeKb: 48000` → text contains
  `about $0.38 a rebuild`.
- [ ] **Step 2: Run** `pnpm test:app` — Expected: FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Project page: a "Settings" section with the same page list as the wizard rail (left list, page on
  the right), Save sends `{ overrides, limits }` via `updateProject`. Verify in the browser: override budget on Scratch,
  save, reload, the rail mark is filled and the from-label says `this project`.
- [ ] **Step 6: Commit** `feat(projects): settings pages, shared by the wizard and the project page`

---

### Task 7: App settings page

**Files:**
- Create: `app/settings/page.tsx`, `app/settings/settings.tsx`
- Modify: `app/projects/topbar.tsx` (add `settings` to the screens)

**Interfaces:**
- Consumes: Task 6 `/api/settings`, `appSettingsQuery`, `updateAppSettings`, `SettingPage` in `mode: 'app'`.

- [ ] **Step 1:** The page: three sections. *Projects folder* (input, placeholder `~/FlowBoard/projects`, same path
  rule as the clone folder). *Connections → GitHub* (the `gh` status in words, the logged-in accounts, the commands from
  Decision 2, "Check again"). *Defaults* (the settings pages of Task 6 in app mode: no override switch, `from` = app).
- [ ] **Step 2: Verify** in the browser (Task 9's setup): `/settings` shows `connected as alextiboldi`; setting the
  folder to `~/code` survives a reload; `#bad channel` shows the channel message and is not saved.
- [ ] **Step 3: Commit** `feat(settings): the app settings page`

---

### Task 8: The wizard, steps 1–3

**Files:**
- Create: `app/projects/wizard/wizard.tsx` (dialog shell, rail, footer, keyboard, state), `app/projects/wizard/repo-step.tsx`
- Modify: `app/projects/list.tsx` (open the wizard instead of `NewProject`)
- Delete: `app/projects/new-project.tsx`

**Interfaces:**
- Consumes: Task 4 routes; Task 1 `PROJECT_TYPES`; in `api.ts` add `githubQuery`, `reposQuery(owner)`, `switchAccount(login)`.
- Produces: `export function Wizard({ onClose }: { onClose(): void }): JSX.Element` and its state:
  ```ts
  interface WizardState { step: 0 | 1 | 2 | 3 | 4; reached: number; type?: ProjectTypeId; source?: 'github'; owner?: string;
    q: string; repo?: GhRepo; sub: number; draft: Draft; dest: 'default' | 'custom'; custom: string; makeDefault: boolean; job?: string }
  ```
  Rules from the mockup: `canLeave`, `go()` (into Settings at the first page going forward, the last coming back),
  `pickRepo` (a different repo sends `reached` back to 3), Enter clicks the enabled primary unless focus is on a
  button or checkbox, Esc closes. Rail sub-labels as in `rail()`. Icons: `Code`, `BookOpen`, `PenLine`, `Database`,
  `GitBranch`, `Folder`, `Check`, `CircleAlert`.

- [ ] **Step 1:** Steps 1–2 (tiles, sources with "coming soon" and "connected as <login>").
- [ ] **Step 2:** Step 3: connect box for `missing`/`signed-out` (the commands, "Check again"), expired box for
  `rejected`, else owners (segmented, `no access` on a restricted owner after its repos were fetched), filter,
  repo list (private badge, language, pushed relative time, taken rows disabled "already the project X"),
  "Don't see an organization?" text, the restricted-org panel with Decision 3's link. "Use another account" switches
  when `accounts.length > 1`, else shows the `gh auth login` command.
- [ ] **Step 3: Verify** with Playwright (Task 9 setup): open the wizard, pick Software → GitHub → ClearCloudSoftware,
  filter narrows the list, picking a repo enables Continue; Esc closes; `main:visible` has no leftover overlay.
- [ ] **Step 4: Commit** `feat(projects): new project wizard: type, source, repository`

---

### Task 9: The wizard, settings, review and clone

**Files:**
- Create: `app/projects/wizard/finish.tsx` (review + destination + clone log)
- Modify: `app/projects/wizard/wizard.tsx`, `app/projects/api.ts` (`startClone`, `cloneJobQuery(id)` polling every 500 ms
  until `done`/`failed`)

**Interfaces:**
- Consumes: Task 6 `SettingPage`, `problems`, `SETTING_PAGES`, `appSettingsQuery` (default folder, `os`,
  `recentFolders`); Task 5 routes; `/api/projects` for the slug preview.

- [ ] **Step 1:** Settings step: sub-pages in the rail with own/bad/caution marks and notes (`subNote`), footer
  "Next: <page>" / "Review", blocked while the page has errors. Overview shows the fixed facts row (name, `/p/<slug>`,
  base branch "follows GitHub", flows, check command "proposed after cloning").
- [ ] **Step 2:** Review: the rows of `reviewView()` with edit links, destination radios, custom folder with "used
  before" chips and "make it my projects folder for new projects too", the `-2` warning. The `-2` preview is the
  server's call: add `GET /api/projects/clone?parent=&name=` → `{ folder }` from `cloneTarget`.
- [ ] **Step 3:** Clone view: progress bar + phase, the log (auto-scrolled, `aria-live="polite"`), "closing this dialog
  does not stop it"; when done, the done box and "Create another" / "Open <name>" (close first, then `router.push`).
  Reopening the wizard while a job runs shows that job. A 404 job → "FlowBoard restarted during the clone; the folder
  may hold a partial clone".
- [ ] **Step 4: Verify end to end.** In the worktree:
  `mkdir -p <scratch>/data && cp -R flows <scratch>/flows && FLOWBOARD_DATA_DIR=<scratch>/data FLOWBOARD_FLOWS_DIR=<scratch>/flows npx next dev -p 3117`,
  set the projects folder to `<scratch>/projects` on `/settings`, then a Playwright script (import from
  `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`) creates a project from `alextiboldi/planning`
  with a $150 budget override and 2048 MB memory: expects the done box, `/p/planning` lists `budget · this project`,
  `<scratch>/projects/planning/.flowboard.yaml` holds `memory_mb: 2048`, and a second run of the same flow shows the
  repo row disabled. Screenshot each step into the scratchpad and look at them against the mockup.
- [ ] **Step 5:** `pnpm lint && pnpm typecheck:packages && pnpm test:packages && pnpm test:app` — Expected: clean except
  the known `flow-start` failure.
- [ ] **Step 6: Commit** `feat(projects): new project wizard: settings, review and clone`

---

### Task 10: Docs

**Files:**
- Modify: `docs/FlowBoard/Projects/Projects Index.md` ("Built" callout), `docs/FlowBoard/Agent Providers/Run Flow Reference.md`
  (project file: `sandbox.memory_mb`/`cpus` written by the wizard; trust/budget/network never read from it),
  `docs/FlowBoard/Projects/Project Record.md` (type, source, overrides), `docs/mockups/README.md` (wizard: built,
  phases 1–2).

- [ ] **Step 1:** Update the notes; list Decisions 1–7 under the Projects Index callout as "open to review".
- [ ] **Step 2: Commit** `docs(projects): the wizard and the settings model as built`
