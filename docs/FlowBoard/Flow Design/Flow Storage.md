---
tags: [flowboard, flow-design, storage]
module: Flow Design
---

# Flow Storage

## Live flows: SQLite

Flow versions are rows in `flows`, `step_defs` and `step_edges` in `data/flowboard.db` (PRD §3, §5). The drawio *Harness architecture* page lists them in *Durable state*: *"projects (check_command) · flows · step_defs (kind, command, max_attempts) · step_edges"*, and calls the database *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*.

Settings: WAL mode, `busy_timeout = 5000` (PRD §3), `foreign_keys=ON` (`02` §1).

Deleting a project cascades to its flows, and deleting a flow cascades to its steps and edges (`ON DELETE CASCADE`). Tasks reference `flows(id)` without a cascade.

## Templates: JSON files

| File | Contents | Source |
|---|---|---|
| `seed/flows/default.json` | The default flow | PRD §3 repo layout |
| Flow template as JSON | *Software delivery*; `researcher` is out of v1 ([[Capability Library Decisions\|D31]]) | backlog Story 1.2 |

Backlog Story 1.3 creates *"flow v1"* from a chosen flow type when a project is made. See [[Seeded Flows]].

## Flows inside packs

The capability-library mockup's bundle packs carry flows: *Delivery pack* → Software delivery, Code review; *Security pack* → Code review, Incident response; *Marketing pack* → Launch campaign, Positioning sprint. The drawio card *Capability packs*: *"Skills + agents + flows bundled and shareable as one unit."* How a pack's flow becomes rows, and whether removing the pack removes the flow, was [[Capability Library Open Questions]] #7. It is moot in v1: there are no bundle packs ([[Capability Library Decisions\|D3]]). See [[Bundle Packs]].

## Export (idea)

- *"Flow versions as immutable JSON, pinned per task → portable, shareable config."* (architecture README)
- *"make them **exportable across projects** … keys uniquified on import."* (`02` §2)
- *"A shareable recipe library — export a recipe and reuse it across projects, or share it with other people."* (feature map, parking lot)

## Not stored

- **Node positions** — undecided (backlog D4 says no). See [[Canvas Layout And Board Order]].
- **Draft mode** — a setting, not part of the flow.
- **Artifacts** — on disk in the task's worktree, not in the flow. See [[Artifact Contract]].

## Related

- [[Flow Data Model]]
- [[Seeded Flows]]
- [[Capability Storage On Disk]]
