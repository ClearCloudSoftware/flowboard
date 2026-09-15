# FlowBoard — Component & Feature Map

A living inventory of every logical component and its features/subfeatures — and a place to **braindump**
new features, new components, and half-formed ideas. The skeleton reflects the PRD, the backlog, and
`docs/architecture/` as they stand; the `💡` slots are yours to fill.

## How to use this

- Find the component your idea touches; add a bullet under its **`💡 Ideas`** line.
- A whole *new* component idea goes in the **[Parking lot](#parking-lot--new-component-ideas)** at the bottom.
- A theme that cuts across components (security, a11y, perf…) goes in **[Cross-cutting](#cross-cutting-themes)**.
- Keep it messy. This is the inbox for thoughts, not a spec. Promote anything real into the PRD/backlog later.

**Legend:** `💡` idea slot · `❓` open question/decision · `→` see also. Everything not marked is current
spec/design surface.

## Contents

- **A. Domain & workflow** — [1 Projects](#1-projects) · [2 Flows / the agentic graph](#2-flows--the-agentic-graph) · [3 Tasks & lifecycle](#3-tasks--lifecycle) · [4 Flow execution engine](#4-flow-execution-engine) · [5 Board](#5-board-read-model)
- **B. Execution** — [6 Agent providers](#6-agent-providers) · [7 Runner](#7-runner--execution-host) · [8 Job queue & worker](#8-job-queue--worker) · [9 Live viewer](#9-event-stream--live-viewer) · [10 Sandboxed execution](#10-sandboxed-execution-exechost)
- **C. Human-in-the-loop** — [11 Question protocol](#11-question-protocol-hitl) · [12 Inbox](#12-inbox) · [13 Notifications & escalation](#13-notifications--escalation)
- **D. Environment & assets** — [14 Workspaces](#14-workspaces--isolation) · [15 Artifact store](#15-artifact-store) · [16 Skills & agents](#16-skills--agents-registry) · [17 Task sources & import](#17-task-sources--import)
- **E. Insight & control** — [18 Cost & usage](#18-cost--usage-ledger) · [19 Settings](#19-settings) · [20 API layer](#20-api-layer)
- **F.** [Cross-cutting themes](#cross-cutting-themes) · [Parking lot](#parking-lot--new-component-ideas)

---

## A. Domain & workflow

### 1. Projects
Purpose: a project binds a name/slug to a local git repo and a default flow.
- Registry: name, slug, `repo_path` (absolute), `default_flow_id`, `created_at`
- Projects list `/`: cards with per-status task counts + this-week spend
- New-project dialog: flow-type select (incl. "Empty" → creates flow v1)
- Repo binding: auto-`git init` scratch repo on seed

**💡 Ideas:** _(add ideas)_

### 2. Flows / the agentic graph
Purpose: a versioned DAG whose nodes are agent/skill invocations and whose edges carry artifacts. → `docs/architecture/README.md#the-agentic-graph`
- Flow versions: immutable; edit forks a new version; version-pinned per task
- Step definitions (nodes): kind (skill/agent/manual), model, effort, permission_mode, allowed_tools, max_turns, max_budget, max_attempts, advance_mode (auto/approval), requires/produces, board_order, is_entry
- Edges: `always` / `on_pass` / `on_fail`; fan-out, join, loop-back
- Artifact-contract validation: every `requires` produced by an ancestor; known types; design-time errors
- `board_order`: layered topological sort
- Flow editor `/p/[slug]/flow`: list or React Flow canvas, drag-to-connect, edge-label cycle, inspector, live validation banner, reuse picker, start-from-flow-type
- Seed flows: `software-development` (8-step), `researcher`

**💡 Ideas:** _(add ideas)_

### 3. Tasks & lifecycle
Purpose: a unit of work that flows through a project's graph.
- CRUD + status machine: backlog / todo / running / blocked / done / failed / cancelled
- Promote (backlog→todo): pin flow, create worktree+branch, pre-create `.vibe/`
- Start (todo→running); Demote (todo→backlog, keep worktree); Cancel (SIGTERM runs, cancel questions, skip instances)
- Worktree cleanup: explicit only, when done/cancelled/failed
- Task detail sheet: timeline (state/attempts/cost/duration/model/effort), artifacts, approve/reject (+reason), plan↔summary diff, retry/cancel/cleanup/promote/start/demote
- ❓ auto-start on promote vs explicit Start (backlog D1)

**💡 Ideas:** _(add ideas)_

### 4. Flow execution engine
Purpose: the state machine that walks the graph. → `docs/architecture/02-core-and-engine.md#3-flow-execution-engine-write-model`
- Advancement: approval gate, awaiting_answers gate, `advance_task` edge resolution
- Conditional edges via step outcome (pass/fail; `set_outcome` / outcome JSON; default pass)
- Fan-out (start all targets) · Join (wait every non-`on_fail` upstream)
- Rework loops: `attempts++`, downstream `wasted=1`, downstream done→skipped, cap → fail task
- Task-done = no active instances **and** no reachable pending targets
- Approve overrides agent `fail`; reject sets `fail` + reason
- ❓ `max_attempts` semantics; downstream attempt counting (backlog D3)

**💡 Ideas:** _(add ideas)_

### 5. Board (read model)
Purpose: the Kanban projection of tasks over the flow.
- Columns: Backlog, Todo, flow steps by `board_order`, Done
- Card: title, current step, state dot, live cost, split badge (per-branch), looped-back (attempt n/m + reason), failed/done
- Drag: Backlog↔Todo only
- Flow strip: attention tints, pan/jump shortcuts
- Card focus + Enter opens sheet; role/tabindex; polling hook (no-store, error state)
- Import `.md` button

**💡 Ideas:** _(add ideas)_

---

## B. Execution

### 6. Agent providers
Purpose: the swappable-CLI seam — Claude/Codex/replay behind one port. → `docs/architecture/01-ports.md#agentprovider`
- AgentProvider port: id, capabilities, resolveModel, launch
- Adapters: Claude Code, Codex, ReplayProvider (test double)
- Capability negotiation: effort / sessions / resume_fork / mcp_tools / plugins / allowed_tools / native_cost / partial_stream / budget_cap
- Normalized event envelope (7 kinds); logical model ids
- Usage extraction; pricing fallback when `native_cost` absent
- ❓ Codex adapter spike before the port hardens (backlog / README open decision)

**💡 Ideas:** _(add ideas)_

### 7. Runner / execution host
Purpose: the generic execution loop; provider-neutral.
- Command build (per adapter); args snapshot to `spec.json`
- Prompt assembly: 6 parts + placeholders + closing headless instruction; resume prompt repeats requires/produces
- Event normalization + one-line summaries; fold partial deltas; token reset per `message_start`
- Cost: `total_cost_usd` authoritative; incremental `num_turns`
- Completion: exit0→succeeded→advance; non-zero→failed/blocked; cancel pending questions
- Artifact scan (mtime ≥ start) matched to `produces`; outcome read from JSON
- Draft-mode transformer; sandbox-tier routing via ExecHost

**💡 Ideas:** _(add ideas)_

### 8. Job queue & worker
Purpose: SQLite-as-queue + a separate worker process.
- Lease in a transaction; stale-lease reclaim; attempts/last_error; concurrency cap `VIBE_MAX_RUNS`
- Job kinds: start_run, advance_task, escalate_question, import_backlog (❓ resume_step)
- Worker lifecycle: restart recovery (re-attach by pid), graceful shutdown (cancelled ≠ failed), session-id capture once

**💡 Ideas:** _(add ideas)_

### 9. Event stream & live viewer
Purpose: watch a run stream live (`/runs/[id]`).
- SSE tail of `run_events`; replay from `Last-Event-ID`; `end` on terminal; dedupe by `seq`
- Viewer: folded text, collapsible tool calls (input+result), sticky footer (elapsed/turns/running cost)
- Stop (SIGTERM by pid); project link by slug; loading/404/stream-lost states; auto-scroll opt-out

**💡 Ideas:** _(add ideas)_

### 10. Sandboxed execution (ExecHost)
Purpose: run each step inside a security boundary. → `docs/architecture/08-sandboxing.md`
- Isolation ladder: host / container / gvisor / microvm
- Security profile: egress allowlist (default-deny), non-root, cap-drop, no-new-privileges, seccomp, ro-rootfs + tmpfs, resource limits, ephemeral
- `bypassPermissions` gate (requires a sandbox tier); Docker probe + host fallback
- HITL-in-sandbox: artifact-file park/resume or host-side broker over a unix socket
- `runs.sandbox` audit; settings `sandbox_profile` (+ per-step override)
- ❓ default tier / strength / HITL-in-sandbox (backlog D7–D9)

**💡 Ideas:** _(add ideas)_

---

## C. Human-in-the-loop

### 11. Question protocol (HITL)
Purpose: let a headless agent ask the human and block/park. → `docs/architecture/04-hitl-and-notify.md#9-human-in-the-loop-protocol`
- `ask_user` MCP server: ask_user, ask_user_batch, declare_artifact, set_outcome; env TASK_ID/STEP_INSTANCE_ID/RUN_ID
- Blocking + 20-min sentinel (`no_answer_yet`)
- Park & resume: exit0 with pending → parked; last answer → start_run `--resume --fork-session`; race re-check
- Artifact-file fallback (MCP-less providers / sealed sandbox)
- Question schema: 5 kinds, options, required — one shape, three renderers
- ❓ undo window (backlog D2)

**💡 Ideas:** _(add ideas)_

### 12. Inbox
Purpose: the fast answer-everything screen (`/inbox`).
- One card per batch, newest-blocking-first
- Controls per kind: yes_no, single_select, multi_select, text, number
- Keyboard: j/k, 1–9, y/n, Enter, ⌘Enter, Esc, g i / g b, ?, r, a (approve gate)
- SSE snapshot stream; answered-elsewhere swaps in place; stale badge; empty state; lost-orchestrator card
- Right rail: running steps + live cost, next-checkpoint ETA, shortcut legend
- Idempotency: first write wins

**💡 Ideas:** _(add ideas)_

### 13. Notifications & escalation
Purpose: chase the human across channels when a question waits. → `docs/architecture/04-hitl-and-notify.md#10-notification--escalation--notifier-port`
- Escalation job: now + threshold; skip if answered/posted; no token → log & continue
- Notifier port: Slack (Block Kit) today; Discord/email/webhook adapters; inline_answer vs link_only
- Per-kind blocks; store channel + ts + escalated_at
- Interactions endpoint: HMAC verify + replay window; reconciliation both directions (`chat.update`); undo

**💡 Ideas:** _(add ideas)_

---

## D. Environment & assets

### 14. Workspaces & isolation
Purpose: per-task filesystem isolation.
- Git worktree per task: branch, stored paths, `.git/info/exclude` hygiene
- Container/microVM adapter via `execHost` → [10](#10-sandboxed-execution-exechost)
- Cleanup explicit; demote reuses the worktree

**💡 Ideas:** _(add ideas)_

### 15. Artifact store
Purpose: step outputs on disk; DB holds only pointers.
- Layout `<worktree>/.vibe/task-<id>/`; `NN-type.ext` naming
- Scan by mtime matched to `produces`; `declare_artifact`; register pointers
- Artifact types: seeded 9 (+ `sources`, `grounding_report`)
- Rendered markdown viewer; JSON as `<pre>`; plan↔summary side-by-side diff
- Remote / content-addressed adapter (future)

**💡 Ideas:** _(add ideas)_

### 16. Skills & agents registry
Purpose: installable capabilities and agent presets.
- Skills: install from GitHub URL → plugin dir; parse SKILL.md frontmatter; update; remove
- Capability packs (per provider): plugin_dir / system_prompt / native mount
- Agents: CRUD (name, desc, system prompt, default model/effort, allowed tools); builtin read-only
- Seed skills (grill-me, code-review, explain-simply, ponytail, ask-three) + agents

**💡 Ideas:** _(add ideas)_

### 17. Task sources & import
Purpose: get tasks into the backlog idempotently.
- Markdown import: one parser (headings + bullets), server-derived stable `import_key`, idempotent upsert
- `backlog-importer` agent (messy files) normalized through the same key fn; report which path ran
- Import endpoint: path or content → temp file → job → cleanup; board button with progress
- TaskSource adapters (future): GitHub Issues, Linear, Jira, webhook

**💡 Ideas:** _(add ideas)_

---

## E. Insight & control

### 18. Cost & usage ledger
Purpose: where the money goes.
- Rollups: per project/day (stacked bars), per step def (by flow version), per model×effort, wasted spend, cost per completed task by flow version
- PricingService: (provider, model, usage) → cost; versioned + dated price table
- Views `/costs`: charts, project filter, real from/to, running estimates

**💡 Ideas:** _(add ideas)_

### 19. Settings
Purpose: global toggles and profiles.
- Draft mode (haiku/low) as a `RunSpec` transformer
- Sandbox profile (tier / image / egress allowlist / limits)
- Theme (light/dark/system, pre-paint, `?theme=` override)
- Escalation threshold (minutes)

**💡 Ideas:** _(add ideas)_

### 20. API layer
Purpose: thin REST + SSE surface.
- Route handlers: validate (zod) → lib fn → JSON; never call ports from a route
- SSE endpoints (run stream, inbox snapshot); Slack interactions
- Endpoint surface per PRD §12

**💡 Ideas:** _(add ideas)_

---

## Cross-cutting themes

Themes that touch many components — dump ideas here when they don't belong to a single box.

- **Security & isolation:** threat model, egress allowlist, secrets handling, permission modes, hook isolation → [10](#10-sandboxed-execution-exechost)
  - **💡** _(add ideas)_
- **Design system / theming / a11y:** tokens, IBM Plex, dark/light parity, keyboard-first, `aria-live`, clickable-div→button
  - **💡** _(add ideas)_
- **Testing & harness:** ReplayProvider, fake `claude` replaying `stream-sample.jsonl`, unit / integration / Playwright E2E lanes
  - **💡** _(add ideas)_
- **Observability & audit:** append-only `runs` journal, `run_events`, structured logging, per-run `spec.json` reproducibility
  - **💡** _(add ideas)_
- **Ports & adapters discipline:** the dependency rule (`core`/`runner` never import adapters), enforced by lint
  - **💡** _(add ideas)_

---

## Parking lot — new component ideas

Whole components that don't exist yet. Seeded with a few provocations; add your own.

- **💡 Remote/cloud execution tier** — a `remote` ExecHost (E2B / Daytona / Modal-style microVMs) so runs can leave the laptop. → [10](#10-sandboxed-execution-exechost)
- **💡 Model router** — pick provider/model per step by cost/latency/capability instead of pinning one.
- **💡 Flow registry** — export/import flows across projects; shareable, versioned templates.
- **💡 External triggers / webhooks** — start a task from a GitHub issue/PR, a Slack command, or a cron.
- **💡 Human-task steps** — the StepExecutor generalization: a step can be a shell command, HTTP call, pure transform, or a manual human gate, not only an AI call. → `docs/architecture/02-core-and-engine.md#3-flow-execution-engine-write-model`
- **💡 Analytics dashboard** — throughput, question-latency SLAs, flow-version A/B on cost-per-task.
- **💡 Record & replay** — reconstruct any past run from `spec.json` + captured events for debugging.
- **💡 Artifact safety linting** — scan produced artifacts / untrusted inputs for prompt-injection before the next step reads them.
- **💡** _(add your own)_
