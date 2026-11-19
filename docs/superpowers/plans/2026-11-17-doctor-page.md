# System Status Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **System status** section at `/settings/status` that shows the `lr-doctor` report, and a "Check your
machine" section on the `/docs` page.

**Architecture:**
1. The probes that block (`spawnSync`) get non-blocking versions that share their parsing with the existing ones, and
   the doctor uses those.
2. The groups and the summary line move into a module with no Node imports, which both the CLI and the page import.
3. `GET /api/doctor` returns `runDoctor({ runner: 'app', … })`, and a client settings page shows it with TanStack
   Query.
4. The docs are one new section in the note the `/docs` page renders.

**Tech Stack:** Next.js 16 (app router), React 19, TanStack Query, shadcn/ui, lucide-react, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-17-doctor-page-design.md`

**Setup:** Work in the worktree `.claude/worktrees/doctor-page` on branch `feature/doctor-page`; `pnpm install` is
already done. Run commands from the repo root.

## Global Constraints

- Before writing Next code, read the route-handler and client-component guides in `node_modules/next/dist/docs/01-app/`
  (`AGENTS.md`).
- UI comes from shadcn/ui components in `components/ui/` (`Button` is there), data comes through TanStack Query, and
  icons come from `lucide-react` only.
- House style: light only, zero radius, hairline `border-border`, no shadows. Colours: ok `text-run`, warn
  `text-wait` / `bg-[var(--wait-soft)]`, fail `text-fail` / `bg-[var(--fail-soft)]`, skip `text-muted-foreground`.
- Never print a secret; the report already holds none. Don't add one.
- Leave the existing sync callers of `dockerNotReady`, `dockerHasGvisor`, `dockerDefaultMemoryMb` and `ghStatus` alone.
- Exact copy:
  - Section title: `System status`.
  - Intro: `Can this machine run your projects now? The same checks as pnpm lr-doctor, run in the app’s own environment.`
  - Button: `Check again`.
  - Nav entry: `System status` with the `Activity` icon, second, under General.

## Review Focus

1. **A slow or stuck Docker or `gh`** must not freeze the app's other pages. Covered by Task 1,
   `ghStatusAsync: does not block the event loop`.
2. **The route is called from another site**: it is refused like every other route (Host check). Covered by Task 2,
   `GET /api/doctor: refused off localhost`.
3. **The doctor throws** (for example, the data folder can't be read): the page shows the error line, not a blank page.
   Covered by Task 2 Step 6, the browser check.
4. **A check with a long detail or fix** (the Claude token line is about 140 characters): it wraps, and doesn't
   overflow the settings column at phone width. Covered by Task 2 Step 6, the browser check at 390 px.
5. **The CLI's text stays the same** after its summary line moves to the shared module. Covered by Task 2: the
   existing `renderReport` tests stay green unchanged.

---

### Task 1: Non-blocking Docker and GitHub probes

**Files:**
- Modify: `packages/cli/src/project.ts` (`dockerDefaultMemoryMb`, `dockerHasGvisor`, `dockerNotReady`, at lines 93-115)
- Modify: `packages/cli/src/github.ts` (`ghStatus`, at lines 34-52)
- Modify: `packages/cli/src/doctor.ts` (`realProbes`, at lines 93-114)
- Test: `packages/cli/test/isolation.test.ts` (it has `fakeDocker`), `packages/cli/test/github.test.ts` (it uses `fakeGh`)

**Interfaces:**
- Produces:
  ```ts
  // project.ts
  export async function dockerDefaultMemoryMbAsync(docker = 'docker'): Promise<number | undefined>;
  export async function dockerHasGvisorAsync(docker = 'docker'): Promise<boolean>;
  export async function dockerNotReadyAsync(image: string, docker = 'docker'): Promise<string | undefined>;
  // github.ts
  export async function ghStatusAsync(gh = 'gh', timeoutMs = 30_000): Promise<GhStatus>;
  ```
- **The rule:** each async function and its sync twin share one pure parser over `{ status: number | null; stdout:
  string; stderr: string; error?: Error }`. Only the runner differs: `spawnSync` or promisified `execFile`. On a
  non-zero exit, `execFile` rejects; take `code`, `stdout` and `stderr` from the error. Same timeouts and the same
  `env` as the sync versions.

- [ ] **Step 1: Write the failing tests.**
  - Add to `isolation.test.ts`:
    ```ts
    test('dockerNotReadyAsync and dockerHasGvisorAsync answer as their sync twins', async () => {
      assert.equal(await dockerNotReadyAsync('lamproom:cli', fakeDocker({})), undefined);
      assert.equal(await dockerNotReadyAsync('lamproom:cli', fakeDocker({ inspect: 1 })), dockerNotReady('lamproom:cli', fakeDocker({ inspect: 1 })));
      assert.equal(await dockerNotReadyAsync('lamproom:cli', fakeDocker({ inspect: 1, info: 1 })), 'Docker is not running');
      assert.equal(await dockerNotReadyAsync('lamproom:cli', '/no/such/docker'), 'Docker is not running');
      assert.equal(await dockerHasGvisorAsync(fakeDocker({ runtimes: '{"runc":{},"runsc":{}}' })), true);
      assert.equal(await dockerHasGvisorAsync(fakeDocker({ runtimes: '{"runc":{}}' })), false);
      assert.equal(await dockerHasGvisorAsync('/no/such/docker'), false);
    });
    ```
  - Add to `github.test.ts`, mirroring each existing `ghStatus` case with the same fake:
    ```ts
    test('ghStatusAsync answers as ghStatus', async () => { /* the connected, missing, signed-out, rejected and too-old cases: assert.deepEqual(await ghStatusAsync(gh), ghStatus(gh)) */ });
    test('ghStatusAsync: does not block the event loop', async () => {
      const gh = fakeGh({ 'auth status --json hosts': 'sleep 1; echo \'{"hosts":{}}\'' });
      let ticked = false;
      setTimeout(() => (ticked = true), 50);
      const p = ghStatusAsync(gh);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(ticked, true);
      assert.deepEqual(await p, { state: 'signed-out' });
    });
    ```
- [ ] **Step 2: Run them and confirm they fail.**
  Run: `node --test packages/cli/test/isolation.test.ts packages/cli/test/github.test.ts`
  Expected: FAIL with "does not provide an export named 'dockerNotReadyAsync'" (and `ghStatusAsync`).
- [ ] **Step 3: Implement the four async functions**, with the shared parsers. Then change `doctor.ts`'s `realProbes`:
  - `docker()` uses `dockerNotReadyAsync` and `dockerDefaultMemoryMbAsync`.
  - `gvisor()` uses `dockerHasGvisorAsync`.
  - `gh()` uses `ghStatusAsync`.
  - Update the `ponytail:` comment above `realProbes`: the real probes no longer block. Keep the sequential first
    phase in `runDoctor` as a guard for injected sync probes, and say so in the comment.
- [ ] **Step 4: Run the tests and confirm they pass.**
  Run: `node --test packages/cli/test/isolation.test.ts packages/cli/test/github.test.ts packages/cli/test/doctor.test.ts && pnpm -s typecheck:packages`
  Expected: all pass.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(doctor): non-blocking docker and gh probes, sharing parsing with the sync ones"`

---

### Task 2: `/api/doctor` and the System status page

**Files:**
- Create: `packages/cli/src/doctor-view.ts`, holding `GROUPS` and `summaryLine`. It has no Node imports,
  so the client can import it.
- Modify: `packages/cli/src/doctor-cli.ts` to import `GROUPS` and `summaryLine` from it and delete its
  own copies.
- Create: `app/api/doctor/route.ts`
- Modify: `app/projects/api.ts` to add `doctorQuery`.
- Create: `app/settings/status.tsx` (the client component) and `app/settings/status/page.tsx`.
- Modify: `app/settings/nav.tsx` to add the `SECTIONS` entry.
- Test: `packages/cli/test/doctor.test.ts` (summaryLine) and `app/api/doctor/route.test.ts`.

**Interfaces:**
- Consumes: `runDoctor`, `DoctorReport`, `Check`, `Status` and `Group` from `packages/cli/src/doctor.ts`, as type-only
  imports on the client.
- Produces:
  ```ts
  // doctor-view.ts
  export const GROUPS: readonly [Group, string][];   // moved as-is from doctor-cli.ts
  export function summaryLine(s: DoctorReport['summary']): string;  // 'Ready.' | 'Ready: N warnings.' | 'Not ready: …' (the CLI's exact text)
  // app/projects/api.ts
  export const doctorQuery: /* queryOptions */ { queryKey: ['doctor']; queryFn: () => Promise<DoctorReport> };
  // with staleTime: Infinity, refetchOnWindowFocus: false, retry: false
  ```

- [ ] **Step 1: Write the failing tests.**
  - In `doctor.test.ts`:
    ```ts
    test('summaryLine: the CLI summary, shared with the page', () => {
      assert.equal(summaryLine({ ok: 5, warn: 0, fail: 0, skip: 0, ready: true }), 'Ready.');
      assert.equal(summaryLine({ ok: 5, warn: 1, fail: 0, skip: 0, ready: true }), 'Ready: 1 warning.');
      assert.equal(summaryLine({ ok: 1, warn: 2, fail: 2, skip: 0, ready: false }), 'Not ready: 2 problems stop runs, 2 warnings.');
    });
    ```
  - `app/api/doctor/route.test.ts`:
    ```ts
    test('GET /api/doctor: refused off localhost', async () => {
      const r = await GET(new Request('http://x/api/doctor', { headers: { host: 'evil.example' } }));
      assert.equal(r.status, 403);
    });
    ```
    If importing the route pulls in `next/server` and breaks under `node --test`, drop this test and record a ruling:
    `refused` is already tested in `local.test.ts`, and the route only calls it first.
- [ ] **Step 2: Run them and confirm they fail.**
  Run: `node --test packages/cli/test/doctor.test.ts app/api/doctor/route.test.ts`
  Expected: FAIL with module or export not found.
- [ ] **Step 3: Implement.**
  - `doctor-view.ts`: move `GROUPS` and the summary expression in `renderReport` out of `doctor-cli.ts`.
  - `route.ts`: `GET(request)` follows `app/api/agents/route.ts`: `await connection()`, then `refused(request)`, then
    `Response.json(await runDoctor({ runner: 'app', dataDir: dataDir(), flowsDir: flowsDir() }))`. Both folder
    helpers come from `app/api/flows/local.ts`. A thrown error becomes `Response.json({ error: message },
    { status: 500 })`, the shape `call` turns into an `ApiError`.
  - `doctorQuery` in `app/projects/api.ts`.
  - `status/page.tsx`: metadata `{ title: 'System status · Settings · Lamproom' }`, rendering `<StatusPage />`, the
    same shape as `agents/page.tsx`.
  - `status.tsx` (`'use client'`):
    - `Head` with the exact title and intro, and a `Button` (variant outline, size sm) `Check again` with lucide
      `RefreshCw`. It calls `refetch()` and is disabled while fetching.
    - While loading, `<Loader>`. On error, `ErrorLine`.
    - A summary bar: `summaryLine(report.summary)`, then `· checked HH:MM, in the app’s environment` (from
      `report.at`). It is tinted `run` when ready and `fail` when not.
    - Then a bordered `section` per group with checks, in `GROUPS` order. The header is the group name plus, right
      aligned and muted, `needed: <why>` of its first `needed` check, except for Core (as the CLI does).
    - Each check is a row:
      - a lucide mark: ok `CircleCheck`, fail `CircleX`, warn `TriangleAlert`, skip `CircleMinus`;
      - the label;
      - the detail, wrapping;
      - when the status isn't ok and there's a `fix`, a mono line under it with a copy button (lucide `Copy`, which
        turns into `Check` for 1.5 s; `navigator.clipboard.writeText`).
    - A row keeps `id` as its React key.
  - `nav.tsx`: add `{ href: '/settings/status', title: 'System status', icon: Activity }` second in `SECTIONS`.
- [ ] **Step 4: Run the tests and confirm they pass.**
  Run: `node --test packages/cli/test/doctor.test.ts app/api/doctor/route.test.ts && pnpm -s typecheck:packages && pnpm -s test:app && pnpm -s lint`
  Expected: all pass, including the unchanged `renderReport` tests. No lint errors in the new files.
- [ ] **Step 5: Type-check the app.**
  Run: `pnpm exec tsc --noEmit -p .`
  Expected: no errors in the new files. (`next build` is not needed.)
- [ ] **Step 6: Check it in a browser** with the `run` skill's approach for a Next app.
  - Start `pnpm dev -p 3217` in the worktree.
  - Open `http://localhost:3217/settings/status` at desktop width and at 390 px.
  - Confirm:
    - the nav entry sits under General and is marked;
    - the summary bar matches `pnpm -s lr-doctor --json`'s `summary`;
    - long details wrap without horizontal scroll;
    - copy puts the fix on the clipboard;
    - **Check again** re-runs (the time changes).
  - Then rename `data/projects.json` aside for one load: the page should show a red `data` check, not a blank page.
    Put the file back.
  - Save the screenshots in the scratchpad and stop the server.
- [ ] **Step 7: Commit.**
  `git commit -m "feat(settings): System status page from the doctor report, at /settings/status"`

---

### Task 3: Document the doctor

**Files:**
- Modify: `docs/Lamproom/Running Agent Work.md`:
  - The intro paragraph on line 7.
  - The ordered section list at lines 45-50.
  - A new `## Check your machine` section before `## Flow Design` (line 52).
- Modify: `docs/Lamproom/Settings And Plumbing/Machine Doctor Handoff.md`: under "Next steps", mark step 1 as done
  (the System status page at `/settings/status`), and note that the probes no longer block.

- [ ] **Step 1: Write the section.** Use the note's shape and voice (Google developer style, second person,
  present tense):
  - **Key concepts:**
    - *needed*, *needed for new projects* and *optional*;
    - `ok`, `warn`, `fail` and `skip`;
    - *ready*.
  - **How it works:**
    - What decides the needs: project trust, the default for new projects, the flows' agents and sandboxes.
    - The 16 checks by group, in a table: each check and what it probes.
    - Read-only, except the Ollama cache.
  - **Configure and use:**
    - `pnpm lr-doctor`, `pnpm -s lr-doctor --json`, exit codes `0`/`1`/`2`.
    - The **System status** page under Settings, and why its token check can differ from the terminal's.
    - A short excerpt of the table output.
  - **Limits and status:**
    - Built 2026-11-17.
    - Not checked: the app server, image staleness, egress, Codex.
    - The deferred issues live in the handoff note.
  - **Related notes:** `[[Machine Doctor Handoff]]` and the design spec.
  - Then update the intro sentence and the numbered section list so the new section is first.
- [ ] **Step 2: Check that the docs page renders it.**
  Run: `node -e "import('./app/docs/render.ts').then(async ({ renderDoc }) => { const { toc } = renderDoc(require('fs').readFileSync('../../docs/Lamproom/Running Agent Work.md','utf8')); console.log(toc.map(t => t.title).join(' | ')) })"`
  Expected: the list includes `Check your machine` before `Flow Design`. If `renderDoc` is async, await it. Then open
  `http://localhost:3217/docs` and confirm the section and its toc link.
- [ ] **Step 3: Run the app tests.**
  Run: `pnpm -s test:app`
  Expected: pass (`render.test.ts` included).
- [ ] **Step 4: Commit.**
  `git commit -m "docs: Check your machine section for lr-doctor and the System status page"`
