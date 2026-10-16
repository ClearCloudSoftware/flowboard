---
tags: [flowboard, settings-and-plumbing, decisions]
module: Settings And Plumbing
---

# Settings And Plumbing Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Anything another note labels a **proposal** is listed here. Questions already tracked in a sibling set are linked rather than repeated in full.

## Settings

### 1. Which settings exist?
Feature map §19 lists draft mode, sandbox defaults, appearance, nudge timing. `06` §15 lists draft mode, threshold, theme, memory (no sandbox). The PRD makes draft mode, sandbox and memory settings, but fixes the threshold at 5 minutes (§10) and never mentions a theme setting. Backlog 8.3 has draft mode, theme, threshold. The drawio SQLite card lists only *"settings (memory, sandbox_profile)"*. **Proposal:** the union of all five, all global; whether any is overridable per project is [[Projects Open Questions]] #23. → [[Settings Catalogue]]

### 2. No settings endpoint
PRD §12 has no route to read or change settings. **Proposal:** `GET /api/settings` and `PATCH /api/settings`, shared with [[Cost API And Routes]] and [[Escalation API And Routes]] ([[Escalation And Notifications Open Questions]] #17). [[Memory API And Routes]] and [[Sandboxing API And Routes]] propose the same pair, with `memory` and `sandbox_profile` as keys of the one settings object ([[Sandboxing Open Questions]] #34). All five sets now agree on the proposal; it stays open because no source defines a settings route. → [[Settings And Plumbing API And Routes]]

### 3. No settings page
PRD §13 describes settings sections but lists no settings route. The drawio puts the draft toggle on `/costs` (*"Costs & settings"*) and groups *"Library · Costs · Settings"*; the flow-designer mockup puts it in the designer topbar. **Proposal:** a `/settings` page; other surfaces read and write the same global value. → [[Settings Surfaces]]

### 4. Draft mode
Where the toggle lives, `haiku` or a logical id, effort, budget, scope, shell steps, rollups, visibility. Fully listed in [[Cost And Control Open Questions]] #5, [[Flow Design Open Questions]] #15 and #28, [[Execution Open Questions]] #45, [[Agent Providers Open Questions]] #13. → [[Draft Mode Setting]]

### 5. Key names, encoding and defaults
`settings` is `(key TEXT, value TEXT)`. No source lists keys or says how values are encoded. `settings.memory.max_recall_chars` implies a nested block. No source gives draft mode's default. **Proposal:** one row per top-level setting, `value` as JSON, one zod `Settings` schema with defaults in code; draft mode off by default. → [[Settings Data Model]], [[Settings Defaults]]

### 6. Escalation threshold: default and unit
5 minutes as a default (`04` §10, backlog 6.1, old handoff; PRD §10 and the drawio fix it at 5 with no setting) or 10 (mockups); stored as `escalation_threshold_ms` (`04` §10, backlog 6.1) but described in minutes (`06` §15, backlog 8.3). See [[Escalation And Notifications Open Questions]] #1, #2. → [[Nudge Timing Setting]]

### 7. Theme: which default, and is there a dark theme?
PRD §13 dark-first; old handoff dark with a light variant; backlog 9.1 light default; mockups light only; feature map §19 and backlog 8.3 a light/dark/system switch. Also (**inference, not in a source**): a theme stored in SQLite would need a server read to set the class *"before first paint"*, which backlog 8.3 asks for. Same as [[Flow Design Open Questions]] #34, [[Human In The Loop Open Questions]] #34, [[Monitor Open Questions]] #27. → [[Appearance And Theme]]

### 8. Sandbox defaults
- PRD §13 offers *"host / container / microVM"*; the port type and `08` add `gvisor`.
- No source gives values for memory, CPU, pids or wall-clock limits.
- `step_defs.sandbox_profile` (backlog 1.1) is not in PRD §5.
- When the Docker probe fails, the setting says `container` but runs use `host`. No source says whether settings shows that ([[Sandboxing Open Questions]] #35).
- On or off by default: `docs/pitch.md` on; `08` and PRD §11.1 *"optional"*; every step defaults to `bypassPermissions` ([[Sandboxing Open Questions]] #3).
- One global allowlist (PRD §11.1) or a per-step one (every mockup); the designer's `none` / `container` / `sealed container` levels ([[Sandboxing Open Questions]] #6, #7, #10).
- Backlog 8.3, the settings story, has no sandbox section ([[Sandboxing Open Questions]] #34).
→ [[Sandbox Profile Setting]]

### 9. Memory block
- Adapter ids: `none`/`local`/self-hosted Mem0/Mem0 cloud (PRD §13), `mem0`/`local`/`none` (`06` §15), `'mem0' | 'mem0-cloud' | 'local' | 'none'` (port).
- What a *"key ref"* refers to.
- `09`: *"default `none` until the first flow opts in"* implies a per-flow switch that no schema has.
- *"recall limit"* has no default.
- Default scopes, per-flow opt-in, and the block's shape are also tracked in [[Memory Open Questions]] #3, #4 and #21; whether Mem0 cloud is a v1 option in #2.
→ [[Memory Settings Block]]

### 10. Transform order, and when a change takes effect
No source fixes the order of the `SpecTransform` chain, or says whether a change reaches tasks already running. **Proposal:** draft mode, then sandbox resolution, then the permission gate last; settings are read when each `RunSpec` is built, so changes reach the next run, never a live one. → [[Settings Overrides And Spec Transforms]]

### 11. No settings history
Nothing records who changed a setting or when. The run records only the resolved model, effort and tier. Fine for one user; the feature map's *Teams & collaboration* theme would need a *who*. → [[Settings Data Model]]

### 12. Validation ranges
Only the old prototype bounds anything (threshold 1–30 minutes). No range for limits, recall limit or `max_recall_chars`. → [[Settings Data Model]]

## API and code layout

### 13. Two file layouts
`06` §15: `src/app/api/` calling `src/lib/`. PRD §3, §12: `apps/web/app/api/` calling `packages/core`. Same as [[Execution Open Questions]] #63. → [[Code Layout And Dependency Rule]]

### 14. Route handlers or server actions?
PRD §12 specifies REST route handlers. PRD §3 and the drawio add server actions (*"API routes + server actions"*; *"A server action validates the request"*). No source says which screens use which. **Proposal:** both call the same core functions; route handlers for anything the SSE client or Slack calls, server actions for form submits. → [[Thin Route Handlers]]

### 15. The layer between handlers and core
Handlers *"write rows → enqueue a job"* (drawio), but core *"imports no … database driver"* (PRD §3). No source names the layer that combines core rules with `packages/db`. **Proposal:** an application-service module per use case (in `apps/web` or a shared package) that opens a transaction, calls core, writes rows and inserts the job. → [[Code Layout And Dependency Rule]]

### 16. Live transport for the board
Runs and the inbox: SSE. The board: SSE (drawio, feature map §20), polling (backlog 2.2), a refreshed materialized view (`02` §4), or a websocket (old handoff, which uses one for run events and question pushes). No inbox or board stream path is named. See [[Monitor Open Questions]] #30, [[Human In The Loop Open Questions]] #31. → [[Live Updates]]

### 17. The stale "deviation" label
`03` §8 and backlog 3.4 call tailing `run_events` a deviation from the PRD's in-memory emitter; PRD §7 now specifies tailing. See [[Monitor Open Questions]] #40. → [[Live Updates]]

### 18. Error shape
Undefined. The backlog records *"non‑JSON error bodies"* (1.3) and asks for *"One error‑handling style"* (7.2). **Proposal:** `{ error: { code, message, issues? } }`; 400 for zod, 404 missing, 409 refused by state. → [[Thin Route Handlers]]

## Database and environment

### 19. Names: `flowboard` or `vibe`?
`data/flowboard.db` (PRD §3, drawio) or `data/vibe.db` (backlog header); env vars `VIBE_*`; `.vibe/`, `.vibe-worktrees/`, `mcp__vibe__*` (PRD) against `.flowboard/worktrees/` and `fb/task-<id>` (drawio). Pick one prefix. Worktree paths: [[Execution Open Questions]] #3, [[Workspaces Open Questions]] #6. → [[Environment And Configuration]]

### 20. Does the MCP process open the database?
PRD §3, §9: never. `02` §1 and backlog 1.1: the DB path env exists so *"worker and MCP"* open the same file. See [[Execution Open Questions]] #54 and [[Human In The Loop Open Questions]] #37. → [[Process Topology]]

### 21. How many tables?
*"14 tables"* (`02` §1, backlog 1.1); PRD §5 has 15 since `plugins` was added; memory adds `memories` and `run_memories`. Same as [[Projects Open Questions]] #20. → [[Domain Schema]]

### 22. Columns PRD §5 still lacks
`runs.model`, `runs.effort`, `runs.sandbox`, `runs.provider`, `agent_session_id` (still `claude_session_id`), `step_instances.reason`, `step_defs.sandbox_profile`. Backlog 1.1 calls three of them *"the three columns that proved necessary"*. → [[Domain Schema]]

### 23. Migration policy
*"migrator runs on first open"* with two processes opening at once; no rule for JSON shapes inside columns (flow versions, `capability_pins`, and `settings.value` if the JSON encoding of #5 is adopted). **Proposal:** migrate once before both processes start; each checks the schema version and refuses to start on a mismatch; JSON shapes carry a version field. → [[Migrations]]

### 24. Where secrets live
Slack in `.env.local` (PRD §10). The real model credential the egress proxy injects (PRD §11.1) and the memory *"key ref"* have no stated home. `SandboxProfile.env` is *"never a real credential"* in `01-ports.md` but *"model/CLI auth"* in `exec-host.ts`. See [[Sandboxing Open Questions]] #26 and #41, and [[Agent Providers Open Questions]] #23 for non-Claude providers. → [[Environment And Configuration]]

### 25. An unauthenticated local API
No auth (PRD §2), and no source says the server binds to `127.0.0.1`. A `host`-tier agent runs as the user, outside the egress wall, and could call the API (for example, approve its own gate). The PreToolUse hooks deny writes and destructive commands, not HTTP to localhost. **Proposal:** bind to loopback only, and add the API port to what the hooks deny on the host tier. Same as [[Sandboxing Open Questions]] #42. → [[Process Topology]]

### 26. Dev port
3111 (backlog 0.3) against `127.0.0.1:7717` in the old handoff's error state. PRD silent. → [[Process Topology]]

### 27. Test runner
`tsx --test --test-concurrency=1` (backlog 0.2) or vitest (drawio *Test lane*). See [[Execution Testing]]. → [[Database And Connection]]

### 28. Append-only journal vs mutable flags
`02` §1's idea (*"never mutate cost after the result lands"*) against `runs.wasted` set when a later rework supersedes a run. See [[Execution Open Questions]] #46. → [[Domain Schema]]

## Added on grounding review

Found when these notes were checked against the sources a second time.

### 29. Empty `--settings`, or the hooks file?
Backlog 0.1 leaves it open (**DEC**: *"e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`"*); D5 recommends *"Empty `--settings` file per run"* (also the drawio's D5 card). PRD §7 passes `--settings <generated per-run settings.json with PreToolUse hooks>`, so the file is not empty. Which one keeps `~/.claude` hooks out is unstated. See [[Agent Providers Open Questions]] #24 and [[Sandboxing Open Questions]] #24. → [[Environment And Configuration]]

### 30. Is Docker out of scope?
The drawio *Out of scope (v1)* card lists *"Auth, accounts, roles, deployment, Docker, multi-machine, plugin marketplace."* PRD §17 scopes out only *"shipping or *deploying* FlowBoard itself in a container"* and keeps sandboxing agents in containers in scope; the drawio's own *Harness architecture* runs *"one throwaway Docker container per run"*. Probably the card means deploying FlowBoard, but it does not say. → [[Settings And Plumbing Roadmap]]

## Related

- [[Settings And Plumbing Index]]
- [[Settings And Plumbing Roadmap]]
- [[Settings And Plumbing Sources]]
