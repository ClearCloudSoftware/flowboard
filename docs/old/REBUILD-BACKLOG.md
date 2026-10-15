# FlowBoard rebuild backlog

Derived from: `PRD.md`, the design handoff (`docs/design_handoff_vibe_kanban`), git history (15 commits, all 2026‑09‑07), the four Claude Code sessions (2026‑09‑07 build, 2026‑09‑07 design/flow follow‑ups, 2026‑09‑09 import debugging, nine headless `backlog-importer` runs), the live `data/vibe.db`, and a file‑level audit of the current code against the PRD.

Tags: **PRD** = required by spec · **GAP** = spec item missing/partial today · **BUG** = defect found in code or in sessions · **FIX** = bug already patched mid‑build, must not regress · **NEW** = post‑PRD feature the user asked for · **DEC** = decision to make before building.

---

## What went wrong the first time (read before estimating)

1. **Milestone verification was curl + sqlite only.** No browser was ever driven; keyboard nav, drag, React Flow canvas interactions and Slack were never exercised live. Several UI bugs (dark‑only markdown, 404 project link on run pages, `a` chip that does nothing, 0 % progress bar, $0 running cost) survived to today.
2. **Backlog import was rewritten three times in one session** (sync parser → sync agent inside the request → async job with temp file). Each rewrite was a reaction to the user re‑testing, not a design. Root causes: two parsers with different task shapes (`##` headings vs bullets), and the agent‑derived `import_key` is not stable across runs (`filter-list-by-status` vs `filter-the-list-by-status`), so re‑import can duplicate.
3. **Todo → running had no UI trigger.** PRD implies promotion leads into the flow; the code added `POST /api/tasks/:id/start` with no button until 2026‑09‑09 (still uncommitted).
4. **Worker restart kills live runs.** Two real runs in the DB failed with "worker restarted while run was live". Runs in `starting` are never reclaimed at all.
5. **Undo window (10 s) was bolted onto the MCP tool**: every answered batch now delays the agent 10 s, and parked resumes are delayed the same way. Not in the PRD.
6. **Environment leaks**: `--add-dir` does not register skills (needs `--plugin-dir`); global `~/.claude` hooks apply to headless runs; agents killed port 3000 (moved to 3111).
7. **Four uncommitted files** carry the last fixes (import route, worker cleanup, board Import button, sheet Start button).

---

## Epic 0 — Ground truth and harness

Goal: nothing is assumed about the CLI; every later epic has a runnable check.

### Story 0.1 Probe the CLI (PRD §0)
- [ ] Run the `stream-json` probe, commit `docs/stream-sample.jsonl` + stderr; note where `total_cost_usd`, `num_turns`, `session_id` and `message_delta.usage` live. **PRD**
- [ ] Verify flags exist: `--effort`, `--session-id`, `--strict-mcp-config`, `--plugin-dir`, `--allowedTools`, `--tools`, `--max-turns`, `--max-budget-usd`, `--append-system-prompt`, `--resume`, `--fork-session`. Record in README. **FIX**
- [ ] Confirm `--plugin-dir <dir>` registers `/slug` and `--add-dir` does not. **FIX**
- [ ] Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`). **DEC**
- [ ] Probe Docker (or Podman) availability and version; decide the runtime and whether gVisor/Firecracker are worth an opt-in tier. If absent, the sandbox tier is unavailable — fall back to `host` and disable `bypassPermissions`. See Story 3.5. **NEW**

### Story 0.2 Test harness
- [ ] `pnpm test` = `tsx --test --test-concurrency=1` on a throwaway `VIBE_DB_PATH`; concurrency 1 because tests share one SQLite file. **FIX**
- [ ] Add an integration lane that spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend. **GAP**
- [ ] Browser E2E lane (Playwright): board drag, sheet actions, inbox keyboard, run viewer stream, flow canvas connect. **GAP**

### Story 0.3 Repo hygiene
- [ ] Dev server on port 3111; README warns agents kill :3000. **FIX**
- [ ] `.gitignore`: `data/*.db*`, `data/runs`, `.vibe-worktrees`, `skills/_installed`. **FIX**
- [ ] Commit or drop the four dirty files before starting. **BUG**

---

## Epic 1 — Foundation (M1)

### Story 1.1 Schema and DB (PRD §5)
- [ ] All 14 tables exactly as §5, plus the three columns that proved necessary: `runs.model`, `runs.effort` (draft mode must not corrupt cost views), `step_instances.reason` (rejection/failure text shown on the card). **PRD/FIX**
- [ ] Sandbox schema (PRD §11.1): `runs.sandbox` (tier that ran, for audit), a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), and an optional `step_defs.sandbox_profile` override. **NEW**
- [ ] `jobs.kind` includes `resume_step` (or drop it, see 4.4). **DEC**
- [ ] Artifact type list in code: the nine PRD types + `sources`, `grounding_report`. **PRD/NEW**
- [ ] DB singleton: WAL, `busy_timeout 5000`, `foreign_keys ON`, cached on `globalThis` for HMR; `VIBE_ROOT`/`VIBE_DB_PATH` env so worker and MCP (spawned with a foreign cwd) open the same file. **FIX**
- [ ] Migrations via drizzle‑kit; migrator runs on first open. **PRD**
- [ ] Either use `questions.state='expired'` or remove it. Today it is never set. **BUG**

### Story 1.2 Seed (PRD §15)
- [ ] Flow templates as JSON: `software-development` (the 9‑step table, exact models/efforts/gates/edges) and `researcher` (scope → web research → summarize → grounding ✋, `on_fail` loop). **PRD/NEW**
- [ ] Agents: researcher, planner, test‑writer, summarizer, backlog‑importer (builtin), web‑researcher, research‑summarizer, fact‑checker. **PRD/NEW**
- [ ] Skills as local plugin dirs `skills/<slug>/.claude-plugin/plugin.json` + `skills/<slug>/skills/<slug>/SKILL.md`: grill‑me (uses `ask_user_batch` and honours `no_answer_yet`), code‑review (calls `set_outcome`), explain‑simply, ponytail, ask‑three (M4 smoke). **PRD**
- [ ] Seed project pointing at an auto‑`git init`ed scratch repo. **PRD**

### Story 1.3 Projects list `/` (PRD §13)
- [ ] Cards: counts per status, this‑week spend (decide rolling 7 d vs calendar week). **PRD/DEC**
- [ ] New‑project dialog with flow‑type select ("Empty" allowed); choosing one creates flow v1. **NEW**
- [ ] Empty state, error handling on submit (non‑JSON error bodies). **BUG**

---

## Epic 2 — Tasks and board (M2)

### Story 2.1 Task lifecycle
- [ ] `POST /api/tasks`, `GET /api/tasks?project=&status=`, `GET /api/tasks/:id`. **PRD**
- [ ] Promote: `git -C <repo> worktree add <repo>/.vibe-worktrees/task-<id> -b vibe/task-<id>`; store both paths; pre‑create `.vibe/task-<id>`; append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean. **PRD/FIX**
- [ ] Pin `tasks.flow_id` at promotion; project flow edits never move in‑flight tasks. **PRD**
- [ ] Demote (todo → backlog) keeps worktree; re‑promote reuses it. **NEW**
- [ ] **Start** (todo → running): decide auto‑start on promote vs explicit Start; expose it on the card and in the sheet. Today only reachable via an uncommitted sheet button. **GAP/DEC**
- [ ] Cancel: SIGTERM live runs, cancel pending questions, mark instances skipped. **FIX**
- [ ] Cleanup worktree only via explicit action, only when done/cancelled/failed. **PRD**

### Story 2.2 Board projection `/p/[slug]` (PRD §13, handoff 1b/1c)
- [ ] Columns: Backlog, Todo, flow steps by `board_order` (topological order from the graph, `on_fail` ignored), Done. **PRD/NEW**
- [ ] Card: title, current step, state dot, live cost, split badge with per‑branch cost, looped‑back (attempt n of m + reason), failed, done. **PRD/handoff**
- [ ] Progress hairline needs `runs.num_turns` written **incrementally** (today only on the final event → always 0 %). **BUG**
- [ ] Native HTML5 drag only Backlog ↔ Todo; Todo drop target only while dragging. **PRD**
- [ ] Flow strip with attention tints, `h`/`l` pan, `[`/`]` jump. **handoff**
- [ ] Either implement the `a` (approve) shortcut or remove the chip from awaiting‑approval cards. **BUG**
- [ ] Card focus model + `Enter` opens the sheet; cards get `role="button"`, `tabIndex`. **GAP (handoff)**
- [ ] Polling hook: `cache: "no-store"`, catch network errors, surface an error state; unhandled rejection today. **BUG**
- [ ] Import .md button (see 7.3). **NEW**

### Story 2.3 Task detail sheet
- [ ] Timeline: state, attempts, cost, duration, **model/effort** per step. **PRD/GAP**
- [ ] Artifacts → rendered markdown dialog (JSON as `<pre>`). **PRD**
- [ ] Approve / Reject as the visual focus of the sheet; **Reject asks for a reason** (API accepts it, board renders it, UI never sends it). **BUG**
- [ ] plan vs summary: side‑by‑side two‑document diff (today inline unified). **GAP (handoff)**
- [ ] Retry, Cancel, Cleanup, Promote, Start, Demote. **PRD/GAP**
- [ ] Loading and error states. **BUG**

---

## Epic 3 — Runner and worker (M3)

### Story 3.1 Job queue (PRD §7)
- [ ] Lease inside a transaction with `UPDATE … WHERE id=(SELECT … LIMIT 1) RETURNING`; stale‑lease reclaim at 10 min; `attempts`/`last_error`; concurrency cap `VIBE_MAX_RUNS`. **PRD**
- [ ] `start_run` must not be completed before the child is spawned; a crash mid‑spawn currently loses the run. **BUG**

### Story 3.2 Runner
- [ ] Command exactly as §7 with `--plugin-dir` per installed skill; `--allowedTools` always appended with `mcp__vibe__*` so a restrictive list cannot lock out `ask_user`; args snapshot to `data/runs/<id>/args.json`. **PRD/FIX**
- [ ] Per‑run `mcp.json` pointing at `mcp/ask-user.ts` via `tsx --tsconfig <root>/tsconfig.json` (path aliases break when spawned from the worktree cwd). **FIX**
- [ ] Prompt builder: six parts in order, `{{task_title}} {{task_body}} {{artifact:<type>}} {{worktree}}`, closing headless instruction. **PRD**
- [ ] Resume prompt must repeat the requires/produces paths, not only the answers. **BUG**
- [ ] Event normalisation into the seven types + one‑line summaries; fold partial deltas. **PRD**
- [ ] Tokens: `message_delta.usage` is cumulative per message — reset per `message_start`, do not sum across deltas. **BUG**
- [ ] Cost: `result.total_cost_usd` authoritative; persist `num_turns` per assistant turn so the viewer/board show live numbers. **PRD/BUG**
- [ ] Completion: exit 0 → succeeded → §8; non‑zero or `is_error` → failed, stderr tail in `runs.error`, task blocked; **cancel that step's pending questions** (today they keep escalating). **PRD/BUG**
- [ ] Artifact scan (mtime ≥ run start) matched to `produces`; `{"outcome":…}` read from produced JSON. **PRD**
- [ ] Draft mode: override to haiku/low and record actual model/effort on the run. **PRD/FIX**

### Story 3.3 Worker lifecycle
- [ ] Restart recovery: reclaim `starting` **and** `running`; prefer re‑attach by pid (still alive → keep tailing) over blanket fail; otherwise fail with a Retry hint. Two real runs died this way. **BUG**
- [ ] Graceful shutdown: SIGTERM children, mark runs `cancelled`, not `failed`. **GAP**
- [ ] Session‑id capture: parse once from the `system/init` event, not every line. **BUG (perf)**

### Story 3.4 Streaming and viewer (`/runs/[id]`)
- [ ] SSE endpoint tails `run_events` (worker is a separate process), replays from `Last-Event-ID`, sends `end` on terminal state. **PRD (deviation, keep)**
- [ ] Viewer: folded text, collapsible tool calls with input + result, sticky footer with elapsed / turns / **running cost** (estimate from tokens until result lands). **PRD/BUG**
- [ ] Project link must use slug (today uses id → 404). **BUG**
- [ ] Dedupe by `seq` on append (StrictMode double‑subscribe duplicates replay). **BUG**
- [ ] Loading, 404 and stream‑lost states; auto‑scroll opt‑out. **GAP**
- [ ] Stop: SIGTERM by pid from the route (same machine), finalise as cancelled. **PRD**

### Story 3.5 Sandboxed execution (Docker/microVM) (PRD §11.1)
- [ ] **ExecHost seam:** route process spawning through an `ExecHost` (`host` | `container` | `gvisor` | `microvm`); providers spawn through it, not raw `child_process`, so any provider runs sandboxed unchanged. **NEW**
- [ ] **`containerWorkspace` adapter:** ephemeral container per run, task worktree bind-mounted as `cwd`, non-root, `--cap-drop ALL`, `--security-opt no-new-privileges`, seccomp default, read-only rootfs + `tmpfs`, `--memory`/`--cpus`/`--pids-limit` + wall-clock. Also removes the shared-worktree collision (2.2). **NEW**
- [ ] **Egress allowlist (load-bearing):** default-deny outbound; allow the model endpoint + the registries a build needs; **not** the project git remote (the host does all git work). Egress proxy (Squid or tinyproxy) on an internal-only Docker network, so the container has no other route out. `[]` = offline. **NEW**
- [ ] **No real credential in the container:** `ANTHROPIC_BASE_URL` points at the egress proxy with a dummy key; the proxy swaps in the real credential only on model-endpoint requests. **NEW**
- [ ] **Gate:** refuse `bypassPermissions` unless the tier is a sandbox; on `host` tier downgrade to an approval/auto mode or fail with a readable reason. **NEW/DEC**
- [ ] **HITL in a sandbox:** the sealed container can't open the host SQLite file — use artifact-file park/resume (Story 4.2) or a host-side `ask_user` broker over a bind-mounted unix socket. Never mount host secrets, the host DB, or the Docker socket; run-scoped env never holds a real credential. **NEW**
- [ ] Map logical `max_turns`/`max_budget_usd` to physical limits; a limit/timeout hit marks the run failed with reason. **NEW**
- [ ] `runs.sandbox` records the tier; draft mode and the sandbox profile compose as `RunSpec` transformers. **NEW**
- [ ] **Tests:** integration lane runs a step in a container against the fake `claude`; assert egress denied except allowlist, and that `bypassPermissions` is refused on the `host` tier. **GAP**
- [ ] Full design + prior art: `docs/architecture/08-sandboxing.md`. **NEW**

---

## Epic 4 — Question loop (M4)

### Story 4.1 MCP server (PRD §9)
- [ ] `ask_user_batch`, `ask_user`, `declare_artifact`, `set_outcome` with PRD shapes; env `TASK_ID`, `STEP_INSTANCE_ID`, `RUN_ID`. **PRD**
- [ ] 2 s poll; 20‑min sentinel with the exact JSON; timeout overridable by `VIBE_ASK_TIMEOUT_MS` for tests. **PRD/FIX**
- [ ] Return only once every required answer is present; ignore `answers.value` null. **FIX**

### Story 4.2 Park and resume
- [ ] Exit 0 with required questions pending → run `parked`, instance `awaiting_answers`, task blocked. **PRD**
- [ ] Last answer → `start_run` with `--resume <session> --fork-session`. **PRD**
- [ ] **Race:** answer arrives while the process is still exiting → `maybeResume` sees `running` and skips, then completion marks the step done without the agent ever seeing the answers. Make completion re‑check "answers arrived after last poll" and resume instead. **BUG**

### Story 4.3 Inbox `/inbox` (PRD §10, handoff 1a/1d/1e)
- [ ] One card per batch, newest‑blocking‑first, five controls per kind, per‑row elapsed, session link. **PRD**
- [ ] Keyboard: `j`/`k`, `1‑9`, `0`, `y`/`n`, `Enter`, `⌘Enter`, `Esc`, `g i`/`g b`, `?`, `r`; focus tracked by question id. **PRD/handoff**
- [ ] SSE snapshot stream (pending + answered in last 2 min) so Slack answers repaint; loading skeleton; "lost the orchestrator" card; stale badge; empty state. **PRD/handoff**
- [ ] Answered‑elsewhere row swaps in place, collapses after the window. **handoff**
- [ ] Right rail: running steps with live cost estimate, next checkpoints (median ETA), shortcut legend. **handoff**
- [ ] Collapse the three overlapping pollers (`/api/inbox/summary` ×2 + `/api/questions?state=pending`) into one. **BUG (perf)**
- [ ] `a` approves the focused gate (handoff promise). **GAP**
- [ ] Replace hard‑coded `#52525b` radio border with a token. **BUG**

### Story 4.4 Undo window
- [ ] **Decide:** keep the 10 s undo (costs 10 s per batch for the agent and delays resumes) or drop it and make Slack/web answers final. If kept: hold only in the web path, not inside the MCP tool. **DEC/NEW**
- [ ] `POST /api/questions/:id/unanswer` + `chat.update` on undo. **NEW**

---

## Epic 5 — Flow engine (M5)

### Story 5.1 Flow versions and validation (PRD §6)
- [ ] `PUT /api/flows/:id` creates a new version; `POST /api/flows/:id/validate` runs the artifact contract (every `requires` produced by an ancestor, exactly one entry, known types) and returns readable errors. **PRD**
- [ ] `board_order` = layered topological order. **NEW**

### Story 5.2 Advancement (PRD §8)
- [ ] Approval gate; awaiting_answers gate; `advance_task` with `always`/`on_pass`/`on_fail`; unset outcome → human gate, never `pass`. **PRD**
- [ ] Fan‑out creates and starts all targets; join waits for every non‑`on_fail` upstream instance. **PRD**
- [ ] Rework: same instance, `attempts++`, new run, downstream runs `wasted=1`, downstream `done` → `skipped` so they re‑instantiate. **PRD**
- [ ] `max_attempts` = total runs incl. the first (default 3); counter on the rework *target*, shared by every loop into it; escalate at the cap or on a repeated shell-check fingerprint; infra retries uncounted (PRD §7–8). **PRD**
- [ ] Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count. **DEC**
- [ ] Task‑done condition: "nothing active and no edge fired" strands a task in `running` when a conditional edge never fires. Use "no active instances and no reachable pending targets". **BUG**
- [ ] Guard `getInstance()!` / `defs.find()!` so a missing row fails the task cleanly instead of throwing three times. **BUG**
- [ ] Approve overrides the agent's `fail` outcome (human wins); reject sets `fail` + reason; reject with no `on_fail` edge fails the task. **FIX**

### Story 5.3 Tests
- [ ] Keep `tests/flow.test.ts` scenarios (validation, gate, fan‑out, join, rework, cap, approve → done); add: conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts. **GAP**

---

## Epic 6 — Slack escalation (M6)

### Story 6.1 Escalation job
- [ ] `escalate_question` at `now + settings.escalation_threshold_ms` (default 5 min); skip if answered or already posted. **PRD/NEW**
- [ ] No token → log and continue. **PRD**

### Story 6.2 Block Kit and interactions
- [ ] Per‑kind blocks (buttons / `multi_static_select` + submit / modal `plain_text_input`); store `slack_channel`, `slack_ts`, `escalated_at`. **PRD**
- [ ] `POST /api/slack/interactions`: v0 HMAC on the raw body, 300 s replay window, `timingSafeEqual`. **PRD**
- [ ] First write wins via conditional UPDATE; loser sees "already answered by <channel>" (PRD wording). **PRD**
- [ ] `chat.update` on web answer, Slack answer, and undo. **PRD**

### Story 6.3 Verification
- [ ] Unit tests (signature, shapes, idempotency, modal) exist; **run once against a real workspace** — never done. **GAP**

---

## Epic 7 — Library and import (M7)

### Story 7.1 Skills `/skills`
- [ ] Install from GitHub URL into `./skills/<slug>` as a plugin dir (add `.claude-plugin/plugin.json` when missing), parse `SKILL.md` frontmatter; update; remove with confirm. **PRD/BUG**
- [ ] Show stored frontmatter or stop storing it. **GAP**
- [ ] Loading/empty states. **BUG**

### Story 7.2 Agents `/agents`
- [ ] CRUD form: name, description, system prompt, default model, default effort, allowed tools; builtin agents read‑only. **PRD**
- [ ] One error‑handling style for create and update. **BUG**

### Story 7.3 Backlog import (PRD §15/§16)
- [ ] **One parser contract.** Deterministic parser handles both shapes: `##` heading = task, and heading‑as‑category with `- **Title** … ` bullets = tasks. Agent path exists for messy files only. **BUG**
- [ ] **Stable `import_key`.** Derive server‑side: front‑matter/inline `id` → else `slugify(title)` — never trust the agent's key (it drifted between runs). Agent output is normalised through the same function. **BUG**
- [ ] Idempotent upsert on `(project_id, import_key)`; re‑import twice = 0 created, N updated. **PRD**
- [ ] `POST /api/import/backlog` accepts `path` (server file) or `content` (browser); `content` goes to a temp file, enqueues `import_backlog` with `cleanup`, returns `{queued}`; worker deletes the temp file. **NEW (uncommitted)**
- [ ] Board button: file picker + paste, busy state, toast; show job progress/result (queued → running → "6 created") so the user is not left guessing. **NEW/GAP**
- [ ] Agent invocation: haiku, `--tools ""`, extract the first `[`…`]`; fall back to the parser on any failure and **report which path ran**. **FIX**
- [ ] Isolate the importer from global hooks (see 0.1). **BUG**

---

## Epic 8 — Costs, flow editor, settings (M8)

### Story 8.1 Costs `/costs`
- [ ] Recharts stacked bars per project per day; tables per step def (by flow version), per model × effort (from `runs.model/effort`), wasted spend, cost per completed task by flow version. **PRD**
- [ ] Add project filter and real `from`/`to` (API supports both, UI sends neither). **GAP**
- [ ] Use the red token, not `text-red-400`; do not freeze `now` for the page lifetime. **BUG**
- [ ] Loading/error state instead of blank. **BUG**

### Story 8.2 Flow editor `/p/[slug]/flow`
- [ ] React Flow canvas: nodes = steps, drag‑to‑connect, edge label cycles `always → on_pass → on_fail`, Backspace deletes, dagre auto‑layout, backwards edges routed under the row. **NEW**
- [ ] Inspector: kind, skill/agent, model, effort, advance mode, entry, requires, produces, limits, permission mode, allowed tools, prompt template. **PRD**
- [ ] Live validation banner (debounced). **PRD**
- [ ] Reuse… picker (steps or whole flow from other projects, key uniquified). **NEW**
- [ ] Start from flow type. **NEW**
- [ ] Save as new version; redirect from a slug prop, not `location.pathname`. **BUG**
- [ ] Stable edge ids (not array index). **BUG**
- [ ] **Decide** whether to persist node positions (needs a layout column). **DEC**
- [ ] Labels paired with inputs; use shadcn `Select` (installed, unused). **BUG**

### Story 8.3 Settings
- [ ] Draft mode toggle; theme light/dark/system (class before first paint, `?theme=` override); escalation threshold in minutes. **PRD/NEW**

---

## Epic 9 — Design handoff and theming

### Story 9.1 Tokens and themes
- [ ] Tokens on `:root` (light default) and `.dark`, mapped into Tailwind; IBM Plex Sans/Mono via `next/font`. **handoff**
- [ ] `markdown.tsx`: `prose dark:prose-invert` (today dark‑only → unreadable in the default theme). **BUG**

### Story 9.2 Chrome
- [ ] Wordmark, nav pills, amber inbox count, running dot + spend today; one summary poller. **handoff**

### Story 9.3 Not built from the bundle
- [ ] `Enter` opens focused card; "Open logs" link in the error state; empty‑state "usually asks N". **GAP**

### Story 9.4 Accessibility baseline
- [ ] Clickable divs → buttons/`role`+`tabIndex`; labels for every control; `aria-live` on the lost‑connection banner; keyboard equivalent for promote/demote. **BUG**

---

## Epic 10 — Acceptance and docs

### Story 10.1 PRD §16 checklist, each as an automated or scripted check
- [ ] `pnpm dev` starts both processes. 
- [ ] Import twice → no duplicates, edits picked up (both file shapes). 
- [ ] Promote creates worktree + branch. 
- [ ] A step streams to `/runs/[id]` with non‑zero cost **and live turns/cost during the run**. 
- [ ] `/grill-me` batch appears in `/inbox` with correct controls. 
- [ ] 5‑min Slack escalation both directions (live). 
- [ ] 20‑min park + resume with answers in context. 
- [ ] `explain` and `review` gate; rest auto. 
- [ ] `implement` ∥ `tests`, `review` joins. 
- [ ] Reject → attempt 2; three failures fail the task. 
- [ ] Bad flow save rejected readably. 
- [ ] Sheet diffs plan vs summary. 
- [ ] `/costs` per step + wasted. 
- [ ] Draft mode forces haiku/low.

### Story 10.2 Docs
- [ ] README: deviations (SSE tail, `--plugin-dir`, port 3111, approve overrides outcome), known constraints (shared worktree, bypassPermissions, hooks leak, manual cleanup, restart behaviour). **PRD**
- [ ] README/security: sandbox tiers and the egress allowlist; the caveat that `bypassPermissions` + sandbox still can't stop exfiltration *within* the sandbox — trusted repos only, no host-secret mounts (see `docs/architecture/08-sandboxing.md`). **NEW**
- [ ] `ponytail:` debt ledger kept current. **NEW**

---

## Decisions to close before Epic 2 starts

| # | Decision | Default recommendation |
|---|---|---|
| D1 | Auto‑start on promote vs explicit Start | Explicit Start button on card + sheet; promote stays cheap |
| D2 | Keep the 10 s undo window | Drop from the MCP path; keep web‑side undo only while no agent is waiting |
| D3 | `max_attempts` = total runs incl. the first (default 3); escalate to a gate, never auto-fail | Decided 2026-10-15; see PRD §8 |
| D4 | Persist React Flow positions | No; dagre is deterministic |
| D5 | Hook isolation for headless runs | Empty `--settings` file per run |
| D6 | Import parser shape | Deterministic parser supports headings **and** bullets; agent optional |
| D7 | Default isolation tier when `bypassPermissions` is on | Container + egress allowlist; `host` only for non-bypass or a trusted opt-out |
| D8 | Container strength: plain Docker vs gVisor/microVM | Docker baseline; gVisor/Firecracker opt-in per untrusted repo |
| D9 | HITL inside a sandbox | Artifact-file park/resume by default; host-side broker over a unix socket when richer |
