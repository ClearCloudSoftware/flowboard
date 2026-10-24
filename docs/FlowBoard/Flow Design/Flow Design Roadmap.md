---
tags: [flowboard, flow-design, roadmap]
module: Flow Design
---

# Flow Design Roadmap

## v1 scope

Flow Design is mostly two PRD milestones, with a few items from **M1** (seed templates, new-project flow type) and **M2** (pinning). **M5 — Flow engine**: *"Step defs, edges, fan-out, joins, conditional edges, approval gates, rework loops with `max_attempts` escalation, shell check steps, artifact contract validation."* **M8 — Cost views and flow editor UI.** (PRD §14)

As built in run-flow (2026-10-23), the M5 engine items are in `core/src/flow/`, with no API in front of them: `validateFlow` (`flow.ts`) checks a flow and `advance` (`engine.ts`) runs it, and the terminal host `pnpm run-flow`, which reads a flow from YAML, is their only caller ([[Run Flow Reference]]). Versions, `board_order` and draft mode are not built, as planned: the run-flow plan covers the engine and a terminal host, not the web app. The flow designer was built on 2026-10-24, at `/flows` in the web app: it edits run-flow's recipe files and checks them with run-flow's own loader ([[Flow Design Screen#As built in the flow designer (2026-10-24)]]).

From M5 and backlog **Epic 5**:

- [ ] `PUT /api/flows/:id` creates a new version (Story 5.1)
- [ ] `POST /api/flows/:id/validate` with readable errors: ancestor-produced `requires`, one entry, known types (Story 5.1). Partly built: `run-flow --check`, and every run before it starts, checks the first two (with one producer per type) and prints each problem as `<yaml>: <field>: <message>`, then exits 2. There is no known-types check, since any lowercase name is a type (Claude's call, 2026-10-23, open to Alex's review; [[Flow Design Open Questions]] #25). The endpoint is the designer's `POST /api/flows/:name/check` (2026-10-24; [[Flow Design API And Routes]])
- [ ] `board_order` as layered topological order (Story 5.1)
- [x] Conditional edges, fan-out, joins, rework, `max_attempts` escalation (Story 5.2; engine side)
- [x] Shell check steps (PRD §7). The run-flow host runs `sh -c` in the run's folder (`--folder`), in its own process group rather than through an execution host, so without a sandbox. Exit 0 is pass; 126, 127 or a death by a signal waits at a *run failed* gate; any other exit is a fail. The last 20,000 characters of output go to the step's `produces` artifact when it declares one, and always into its run log ([[Check Steps]])
- [x] Flow tests, plus *"conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts"* (Story 5.3), in `core/test/engine.test.ts`, except cancel: there is none (the run-flow plan's Left out list), and *Fail the flow* stopping a sibling's live run comes nearest

From M8 and backlog **Story 8.2 Flow editor**:

- [x] Canvas: *"nodes = steps, drag‑to‑connect, edge label cycles `always → on_pass → on_fail`, Backspace deletes, dagre auto‑layout"* — or the PRD's acceptable fallback, a vertical list with a connections panel. Built on 2026-10-24 with React Flow; the auto-layout is the designer's own, a layered one, not dagre ([[Canvas Layout And Board Order]])
- [ ] Inspector: *"kind (`ai`/`shell`/`manual`), agent and/or skill, model, effort, advance mode, entry, requires, produces, limits, permission mode, allowed tools, prompt template"*. Partly built (2026-10-24): `ai` or `shell`, no `manual` (#39); skill, inline system prompt and prompt file, no pickers; model, effort, approval, entry, requires, produces and limits. Permission mode and allowed tools have no field and are kept as written ([[Flow Design Controls]])
- [x] *"Live validation banner (debounced)"*: the validation strip, `run-flow --check` on the draft (2026-10-24)
- [ ] *"Reuse… picker (steps or whole flow from other projects, key uniquified)"*
- [ ] *"Start from flow type"*
- [ ] BUGs: save redirect from a slug prop; stable edge ids; labels paired with inputs, shadcn `Select`. Stable edge ids and labels paired with inputs are built (2026-10-24): a route is named by its two steps, and every field has its label. There is no redirect, and selects are the browser's own
- [x] **DEC**: persist node positions? No, as backlog D4 has it (Claude's call, 2026-10-24, open to Alex's review; [[Canvas Layout And Board Order]])

From elsewhere:

- [ ] Flow template as JSON: *Software delivery*, *"the 9‑step table, exact agent/skill pairs, models/efforts/gates/edges"* (Story 1.2). `researcher` is out of v1 (D31).
- [ ] New-project dialog with a flow-type select, *"Empty"* allowed (Story 1.3)
- [ ] Pin `tasks.flow_id` *"at promotion"* (Story 2.1); whether that is promote or Start is [[Flow Design Open Questions]] #7
- [ ] Draft mode toggle (Story 8.3)
- [ ] Acceptance: *"Saving a flow whose step requires an artifact nobody produces is rejected with a readable error"* (PRD §16; Story 10.1). The check is built: run-flow refuses such a flow before it runs, `steps.review: requires "notes", and no step before it produces that`, and since 2026-10-24 the designer's Save refuses it with the same line

## Designed in the mockup, beyond the PRD

- The **flow library** rail: domains, search, grouping by name, variant comparison, ★ org default, fork lineage, difference line, shape glyph
- **Preview** a library flow ghosted, and **Use this flow**
- The version chip with *adopted / edited / preview*, and *Save as v(n+1)*
- The **validation strip** with one clickable row per problem
- The **reachability** check (*"has nothing leading into it"*). As built in run-flow (2026-10-23), each problem sits on its step, so a strip row could select it: `steps.new: no route leads here from the entry step "plan"`, or, when several steps have no route into them, one on each ([[Flow Design Open Questions]] #18)
- The *unattended and unsandboxed* flag
- The canvas bar's **ceiling per task** and conditional-route count. As built in run-flow (2026-10-23), a flow states its ceiling instead, a required `budget_usd` for the whole flow, `0` for none (Alex's call; see [[Step Guardrails#Ceiling per task]])
- The status bar's *N tasks still running on vN*
- Draft mode as a designer toggle

## Ideas

| Idea | Source |
|---|---|
| Assign a step to a person or role | feature map §2 ideas |
| Role starter packs — see [[Role Starter Flows]] | feature map §2 ideas, appendix |
| Route the next human step to a teammate | feature map §4 ideas |
| Two sign-offs on one gate | feature map §4 ideas |
| A shared, governed library with an owner for the "golden" recipes | feature map §16 ideas |
| Team guardrails nobody can quietly lift | feature map §16 ideas |
| A shareable recipe library; export across projects | feature map parking lot; `02` §2 |
| Auto-pick the AI per step | feature map parking lot |
| More steps that aren't AI (service call, human checklist) — the StepExecutor | feature map parking lot; `02` §3 |
| Deterministic gates (semgrep, gitleaks, trivy, eslint/ruff) as extra shell steps | drawio *Harness architecture* (dashed) |
| Scheduled maintenance flows: knowledge-asset refresh, nightly gates | drawio *Schedule trigger (later)* (dashed) |
| Injection scan over artifacts before the next step trusts them | drawio *Injection scan (later)*; feature map parking lot |

## Out of scope (v1)

PRD §17: *"authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace"*. That rules out authors, ownership and permissions on flows in v1 — the library's `@author` identities depend on the teams foundation (feature map *Across everything → Teams & collaboration*). The feature map calls only the *shared team tier* (accounts, roles, a shared server) *"a later, separate decision"*. It says local collaboration with named people needs no accounts server.

## Related

- [[Flow Design Overview]]
- [[Flow Design Open Questions]]
- [[Seeded Flows]]
