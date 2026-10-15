---
tags: [flowboard, flow-design, roadmap]
module: Flow Design
---

# Flow Design Roadmap

## v1 scope

Flow Design spans two PRD milestones. **M5 — Flow engine**: *"Step defs, edges, fan-out, joins, conditional edges, approval gates, rework loops with `max_attempts` escalation, shell check steps, artifact contract validation."* **M8 — Cost views and flow editor UI.** (PRD §14)

From M5 and backlog **Epic 5**:

- [ ] `PUT /api/flows/:id` creates a new version (Story 5.1)
- [ ] `POST /api/flows/:id/validate` with readable errors: ancestor-produced `requires`, one entry, known types (Story 5.1)
- [ ] `board_order` as layered topological order (Story 5.1)
- [ ] Conditional edges, fan-out, joins, rework, `max_attempts` escalation (Story 5.2; engine side)
- [ ] Shell check steps (PRD §7)
- [ ] Flow tests, plus *"conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts"* (Story 5.3)

From M8 and backlog **Story 8.2 Flow editor**:

- [ ] Canvas: *"nodes = steps, drag‑to‑connect, edge label cycles `always → on_pass → on_fail`, Backspace deletes, dagre auto‑layout"* — or the PRD's acceptable fallback, a vertical list with a connections panel
- [ ] Inspector: *"kind, skill/agent, model, effort, advance mode, entry, requires, produces, limits, permission mode, allowed tools, prompt template"*
- [ ] *"Live validation banner (debounced)"*
- [ ] *"Reuse… picker (steps or whole flow from other projects, key uniquified)"*
- [ ] *"Start from flow type"*
- [ ] BUGs: save redirect from a slug prop; stable edge ids; labels paired with inputs, shadcn `Select`
- [ ] **DEC**: persist node positions?

From elsewhere:

- [ ] Flow templates as JSON: `software-development`, `researcher` (Story 1.2)
- [ ] New-project dialog with a flow-type select, *"Empty"* allowed (Story 1.3)
- [ ] Pin `tasks.flow_id` (Story 2.1)
- [ ] Draft mode toggle (Story 8.3)
- [ ] Acceptance: *"Saving a flow whose step requires an artifact nobody produces is rejected with a readable error"* (PRD §16; Story 10.1)

## Designed in the mockup, beyond the PRD

- The **flow library** rail: domains, search, grouping by name, variant comparison, ★ org default, fork lineage, difference line, shape glyph
- **Preview** a library flow ghosted, and **Use this flow**
- The version chip with *adopted / edited / preview*, and *Save as v(n+1)*
- The **validation strip** with one clickable row per problem
- The **reachability** check (*"has nothing leading into it"*)
- Per-step **budget**, **retries** and **sandbox** in the inspector
- The *unattended and unsandboxed* flag
- The canvas bar's **ceiling per task** and conditional-route count
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

PRD §17: *"authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace"*. That rules out authors, ownership and permissions on flows in v1 — the library's `@author` identities depend on the teams foundation the feature map calls *"a later, separate decision"*.

## Related

- [[Flow Design Overview]]
- [[Flow Design Open Questions]]
- [[Seeded Flows]]
