---
tags: [flowboard, settings-and-plumbing, sources]
module: Settings And Plumbing
---

# Settings And Plumbing Sources

Every fact in these notes comes from the files below (paths relative to the repo root). Checked on 2026-10-15 against the `dev` branch at `49c7d97`.

## Primary

| File | What it contributes |
|---|---|
| `docs/feature-map.md` §19, §20 | The four settings (draft mode, sandbox defaults, appearance, nudge timing); thin connections; live updates |
| `docs/old/architecture/06-cost-and-platform.md` §15 | Component #15: the `settings` table contents, thin handlers (*"validate → lib → JSON"*), ports never called from a route, `SpecTransform` and `draftMode` |
| `docs/old/architecture/02-core-and-engine.md` §1, §4 | Component #1: the tables and invariants, provider-neutral renames, `runs.model`/`effort`, `step_instances.reason`, WAL + `busy_timeout` + `foreign_keys`, `VIBE_DB_PATH`, append-only journal; materialized board view |
| `docs/old/PRD.MD` §2, §3, §5, §12, §13 | Stack (SQLite, Drizzle, SSE not websockets, separate worker, no auth); pnpm workspace and the dependency rule; the `settings` table and full schema; the API surface; settings sections for draft mode, sandbox and memory |
| `docs/old/REBUILD-BACKLOG.md` | Story 0.1 (CLI isolation, Docker or Podman probe), 0.2 (test DB), 0.3 (port 3111, `.gitignore`), 1.1 (schema, singleton, migrations), 1.3 and 7.2 (error bodies), 2.2 (polling hook), 3.1, 3.2, 3.4, 3.5, 4.1, 4.3, 6.1, **8.3 (settings)**, 9.1, 9.2, 9.4, 10.1, 10.2; D5, D7, D8 |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: *Costs & settings* card with the draft toggle; out-of-scope card (lists *Docker*). *Logical components*: *Costs /costs rollups and draft-mode toggle*; Database and Disk stores. *Functional components*: draft mode under *Cost & control*. *Harness architecture*: two processes, thin `apps/web`, *API routes + server actions*, *SSE endpoints*, *EventSource … no client state store*, SQLite card (WAL, busy_timeout, `settings (memory, sandbox_profile)`), *Library · Costs · Settings* card, Runner card (draft-mode transform), *Tiers* and egress proxy cards, code layout, life of one step (A, B, G) |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/PRD.MD` §0, §4, §6, §7, §9, §10, §11.1, §11.2, §14, §15, §16, §17 | CLI probes; invariants; SSE tailing; `max_recall_chars`; Slack env in `.env.local`; `sandbox_profile`, Docker probe; memory block; milestones; seeds (no settings rows); acceptance; out of scope |
| `docs/old/architecture/README.md` | Dependency rule and lint rule; suggested module layout; component index (#1, #15); open decisions 3 (sandbox posture) and 4 (memory posture) |
| `docs/old/architecture/01-ports.md` | `SandboxProfile`, `ExecHost`, `MemoryStore` ids; memory port *"never from a route"* |
| `docs/old/architecture/03-execution-substrate.md` §6, §7, §8 | Runner applies draft mode; worker as generic executor host, `VIBE_MAX_RUNS`; SSE tail, `end` on terminal state |
| `docs/old/architecture/04-hitl-and-notify.md` §9, §10 | Inbox SSE snapshot stream; `settings.escalation_threshold_ms` |
| `docs/old/architecture/08-sandboxing.md` | *"Optional, off by default for trusted local repos"*; isolation ladder; recommended defaults (container when bypassing, egress allowlist editable in settings, Docker probe) |
| `docs/old/architecture/09-memory.md` | The memory block in settings; recommendations (`local` first, `user` scope) |
| `docs/old/reference/core/ports/exec-host.ts`, `memory-store.ts` | `IsolationTier`, `SandboxProfile` fields (its `env` comment: *"Run-scoped env (model/CLI auth)"*); memory adapter ids |
| `docs/old/reference/README.md` | Builtins-only, strip-only TS rule |
| `docs/old/design/README.md`, `brief.md`, `Vibe Kanban.dc.html` | Dark-first brief and light variant; *"One websocket for run events"*; connection states and *Lost the orchestrator*; client state (`draftAnswers`, shared ticker); `escalationMinutes` tweak (default 5, 1–30) |
| `docs/mockups/flow-designer.html`, `flow-designer-guide.html` | The only rendered settings control: the draft mode toggle; *"Draft mode isn't a version"*; the per-step **Sandbox** select (`none`, `container`, `sealed container`) |
| `docs/mockups/README.md`, `inbox.html`, `inbox-guide.html`, `monitor.html`, `task-detail.html` | *"Light only — no dark variant"*; a 10-minute escalation (`ESCALATE = 10 * MIN` in the inbox, `> 10 * MIN` in the monitor, *"escalation after 10m"* in the inbox guide); status bars showing *"sandbox **container**, egress **default-deny**"*; *"this step's egress allowlist"* (`inbox.html`), *"this step's allowlist"* (`inbox-guide.html`), *"not in the step allowlist"* |
| `docs/pitch.md` | *"a global **draft mode** forces the cheapest models while iterating"*; *"FlowBoard makes the safe path the default: each step runs in a **sandbox**"* |
| `.gitignore` | `data/*.db*`, `data/runs/`, `.vibe-worktrees/` |
| `code/flowboard/` | A stock `create-next-app` scaffold (Next.js 16.4.1, React 19.3.0, Tailwind 4; `globals.css` follows `prefers-color-scheme`); no settings or API code. Since 2026-10-18 also `packages/` (core, adapters, ask-user, cli), the source, with the [[Agent Providers Index\|Agent Providers]] notes, of the *as built* corrections made on 2026-10-22 |

## Sibling notes linked rather than repeated

[[Draft Mode]], [[Draft Mode And Spec Transforms]], [[Escalation Threshold]], [[Event Stream And SSE]], [[Run Guardrails At Launch]], [[Prompt Assembly]], [[Memory Cost Accounting]], [[Job Queue]], [[Worker Lifecycle]], and each set's API note.

From the newer sets: [[Projects Data Model]], [[Intake Data Model]], [[Workspaces Data Model]], [[Agent Providers Data Model]], [[Sandboxing Data Model]], [[Sandbox Configuration]], [[Sandbox Defaults]], [[Permission Gate]], [[Memory Settings]], [[Memory Data Model]].

## Related

- [[Settings And Plumbing Index]]
