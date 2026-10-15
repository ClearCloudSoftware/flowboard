---
tags: [flowboard, flow-design, sources]
module: Flow Design
---

# Flow Design Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `c4b01fd` (2026-10-15): the PRD and backlog corrections in `198e7de` and the v3 harness design pass in `c4b01fd`, which added the feature map's *Check steps* bullet and the drawio *Harness architecture* page.

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/flow-designer.html` | The screen: topbar, library rail, canvas, inspector, validation strip, status bar. Sample library (17 flows, 5 authors). The open flow *Software delivery @core v4*. `validate()` and `ancestors()`. Preview, adopt, add, delete, drag, draft mode, keyboard. Option lists for model, effort, sandbox. Domain step names and roles. |
| `docs/mockups/flow-designer-guide.html` | Field guide: anatomy, the same-name problem, *What to compare*, shape glyph, step states, routes, branching and joining, every field with *Get it wrong and*, needs/produces marks, version state diagram, validator rules, draft mode, the 9-beat adopt-and-adapt walkthrough, every control, keyboard |
| `docs/feature-map.md` §2 | Steps, skill or agent, check steps, guardrails, auto or approval, connections, branching, joining, loops, needs/makes, versions, visual editor, ready-made recipes; ideas (assign a step, role starter packs) |
| `docs/old/PRD.MD` | §2 no user table; §3 `packages/core` rule, `seed/flows/default.json`; §4 core concepts; §5 `flows`, `step_defs`, `step_edges` and referring columns; §6 artifact contract and seed types; §7 prompt parts, shell steps, flags; §8 advancement, outcomes, joins, rework, `max_attempts`, escalation, fingerprint; §11 shared worktree; §11.1 `bypassPermissions` rule; §12 flow endpoints; §13 flow editor, board columns, draft mode; §14 M5, M8; §15 seeded flow; §16 acceptance; §17 out of scope |
| `docs/old/architecture/02-core-and-engine.md` | §1 invariants; §2 Flow definition & validation (component #2); §3 engine rules and StepExecutor; §4 board projection |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Flow engine and Flow editor groups, D3, D4, StepExecutor card, Add step form, live validation banner, board cards, cost cards, seed data. *Logical components*: Flow editor → Flow engine. *Functional components*: Flow design group (4 cards) and its edges. *Harness architecture*: Flow designer (xyflow), Flow validation on save, Flow engine, Loop guard, Shell executor, concepts 1, 4, 6, 7, 8, Life of one step |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/REBUILD-BACKLOG.md` | Story 0.2 Playwright lane; 1.1 schema additions, artifact types; 1.2 flow templates; 1.3 new-project flow type; 2.1 pinning, Start; 2.2 board columns; 3.2 prompt placeholders, resume, draft mode; 3.5 sandbox gate; 5.1 versions and validation; 5.2 advancement BUG/FIX/DEC items; 5.3 tests; 8.2 flow editor; 8.3 settings; 10.1 acceptance; decisions D1, D3, D4, D7 |
| `docs/old/architecture/README.md` | *The agentic graph*; *What the spec already got right*; module layout; component index; open decision 1 (StepExecutor) |
| `docs/old/architecture/01-ports.md` | Capability negotiation (warning severity), logical model ids, sandbox gate, ArtifactStore type-graph validation |
| `docs/old/architecture/03-execution-substrate.md` §6 | Prompt parts, artifact scan, shell steps as sensors, logical vs physical caps, infra retries |
| `docs/old/architecture/04-hitl-and-notify.md` §9 | Questions as an artifact type |
| `docs/old/architecture/05-environment-and-registry.md` §11, §13 | Store-agnostic contract; provider-match check |
| `docs/old/architecture/06-cost-and-platform.md` §12, §15 | Cost by step and flow version; draft mode as a spec transform |
| `docs/old/architecture/08-sandboxing.md` | Tiers, the `bypassPermissions` gate, physical backstops |
| `docs/old/reference/core/ports/agent-provider.ts` | `RunSpec`, `PromptParts`, `RunResult.outcome`, `Effort`, capability flags |
| `docs/old/reference/core/ports/artifact-store.ts` | `scan(…, produces)`, type-graph validation |
| `docs/old/design/brief.md` | §6 Flow editor: *"Propose the cheapest thing that communicates branching honestly"* |
| `docs/old/design/README.md` | `standard-flow · 8 steps`, *"Plan needs approval"*, 11 columns, ≤ ~14 columns |
| `docs/mockups/README.md` | Summary of the designer and guide |
| `docs/mockups/monitor.html`, `monitor-guide.html` | The flow as data (`STEPS`, `COLS`, `NEXT`, `DEPS`); the four hand-off rules; pipeline view loop edge; *"Retries are capped, then the task fails"* |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | Pinned version (`v4`, *v5 exists*); per-step agent/model/effort; Files tab as the contract |
| `docs/mockups/inbox.html`, `inbox-guide.html` | *Allow host & retry* edits a step's allowlist; *Attempt 3 of 3 failed* |
| `docs/mockups/capability-library.html`, `capability-library-guide.html` | *Used by* per flow version and step; steps using a skill and an agent; packs containing flows; provider-match *refuses to save*; flows not pinned to capability versions |
| `docs/FlowBoard/Capability Library/*` | Linked rather than repeated: [[Capabilities In Flows]], [[Provider Coverage And Portability]], [[Bundle Packs]] |

## Related

- [[Flow Design Index]]
- [[Flow Design Open Questions]]
