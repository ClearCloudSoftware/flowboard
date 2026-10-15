---
tags: [flowboard, index, tracker]
---

# Component Documentation Tracker

Every FlowBoard component that needs a documentation set like [[Capability Library Index|Capability Library]]. Each set lives in its own vault folder, `docs/FlowBoard/<Component>/`, with an index note named `<Component> Index`.

**Status:** ✅ generated in the vault · ⬜ not generated yet

## Functional components

Siblings of the Capability Library on the drawio *Functional components* page.

| Status | Component | Scope | Mockup + guide | Feature map | Architecture |
|---|---|---|---|---|---|
| ✅ | [[Capability Library Index\|Capability Library]] | Skills, agents, bundle packs, provider packs, install, update, remove | `capability-library` | §16 The library | #13 Skill/Agent registry → Capability packs |
| ✅ | [[Flow Design Index\|Flow Design]] | Versioned DAG, step editor, artifact contract, version pinning, flow library | `flow-designer` (also `capability-library`, `monitor`, `task-detail`) | §2 Flows (also §1, §3, §4, §5, §19) | #2 Flow definition & validation (also #3, #4) |
| ✅ | [[Human In The Loop Index\|Human In The Loop]] | Questions, batches, approvals, the inbox | `inbox` | §11 Questions, §12 The inbox | #9 Human-in-the-loop protocol |
| ✅ | [[Monitor Index\|Monitor]] | Status at a glance, needs-you, worker slots, burn / today / wasted, pulse, timeline and pipeline views, live run viewer | `monitor` (the live run viewer has no mockup) | §5 The board, §9 Live run viewer (also §8, §13, §18) | #4 Board projection, #8 Event stream & live viewer (also #7, #12) |
| ✅ | [[Task Detail Index\|Task Detail]] | One task's whole story: timeline, artifacts, cost | `task-detail` | §3 Tasks, §15 Artifacts | #11 Artifact store & workspace |
| ✅ | [[Execution Index\|Execution]] | Start, run a step, advance, rework loop, split and join, stop | partial (via task detail) | §4 The engine, §7 The runner, §8 The work queue | #3 Flow execution engine, #6 Runner, #7 Job queue & worker lifecycle |
| ✅ | [[Cost And Control Index\|Cost And Control]] | Live cost, rollups, wasted spend, draft mode | — | §18 Cost tracking | #12 Cost & usage ledger + PricingService |
| ✅ | [[Escalation And Notifications Index\|Escalation And Notifications]] | Slack escalation, signed inbound, resolve everywhere | — | §13 Notifications | #10 Notifier port |
| ⬜ | Intake And Import | Backlog import, create task, promote, seed project | — | §17 Importing work | #14 TaskSource port |
| ⬜ | Memory | Recall, distil, four scopes, off by default | — | §21 Memory | #16 MemoryStore port (`09-memory.md`) |

## Platform components

Cross-cutting pieces under every functional component. Better documented as architecture reference than as screens.

| Status | Component             | Scope                                                                               | Feature map                | Architecture                       |
| ------ | --------------------- | ----------------------------------------------------------------------------------- | -------------------------- | ---------------------------------- |
| ⬜      | Agent Providers       | AgentProvider port, capability negotiation, logical models, Claude / Codex / replay | §6 Agent providers         | #5 AgentProvider, `01-ports.md`    |
| ⬜      | Sandboxing            | Container, egress allowlist, mounts, in-agent hooks                                 | §10 Sandboxing             | `08-sandboxing.md`                 |
| ⬜      | Workspaces            | Git worktree per task, branches, cleanup                                            | §14 Workspaces             | #11 Workspace port                 |
| ⬜      | Projects              | Projects, repos, check command, visibility                                          | §1 Projects                | #1 Domain model & migrations       |
| ⬜      | Settings And Plumbing | Settings, draft mode, API surface, DB, migrations                                   | §19 Settings, §20 Plumbing | #15 Settings, draft mode, API · #1 |

## Suggested order

1. Flow Design, Human In The Loop, Monitor, Task Detail — each has a mockup and a field guide, so these are the richest sources.
2. Execution — ties the four together.
3. Cost And Control, Escalation And Notifications, Intake And Import, Memory — no screen designs yet, so expect more open questions.
4. Platform components.

Possible merges: fold Escalation And Notifications into Human In The Loop (the inbox guide already covers Slack resolution). Fold Projects into Settings And Plumbing as one "Platform" set.

## Generation prompt

Copy the prompt below into Claude Code from the repo root. Replace `{{COMPONENT}}` with a component name from the tables above, e.g. `Flow Design`.

```text
Generate the documentation set for the FlowBoard component "{{COMPONENT}}" in the
Obsidian vault at docs/FlowBoard/, the same way the Capability Library set was made.

1. Worktree. Do this component's work in its own git worktree, never in the main
   checkout, so several components can be documented in parallel:
     git worktree add .claude/worktrees/{{component-kebab-case}} \
       -b feature/{{component-kebab-case}} dev
   Run every later step, edit and commit from inside that worktree. Do not switch
   branches in the main checkout. Leave the worktree in place when you finish so
   the branch can be reviewed.

2. Gather every source that mentions the component. Look the component up in
   docs/FlowBoard/Component Documentation Tracker.md for its mockup, feature-map
   section and architecture component, then check at least:
   - docs/mockups/<screen>.html and docs/mockups/<screen>-guide.html. Much of their
     content is rendered by JavaScript (tables, walkthroughs, sample data, action
     lists), so read the <script> blocks as well as the markup.
   - docs/flowboard-ideation.drawio. Decode every page (diagrams may be
     deflate+base64 compressed) and collect the nodes and edges for the component.
   - docs/feature-map.md (its section and any ideas or appendix that mention it).
   - docs/old/PRD.MD (schema, runner, API, UI, seed data, milestones).
   - docs/old/REBUILD-BACKLOG.md (stories, BUG/FIX/GAP items).
   - docs/old/architecture/*.md and docs/old/reference/**/*.ts (ports, types).
   - Sibling mockups and guides that reference the component.
   Record which file each fact comes from.

3. Write the notes in docs/FlowBoard/{{COMPONENT}}/ following the vault rules:
   one topic per note, Title Case filenames, no subfolders, [[wikilinks]] by note
   title, a "## Related" section at the bottom of each note, frontmatter with
   tags: [flowboard, <component-kebab-case>, ...] and module: {{COMPONENT}}.
   Cover every aspect the sources support. At minimum:
   - {{COMPONENT}} Index        — hub linking every note, grouped by theme
   - {{COMPONENT}} Overview     — purpose, place in the system, design principles
   - {{COMPONENT}} Glossary     — terms, flag overloaded words
   - one note per core concept, entity or kind
   - one note per behaviour or rule (lifecycle, validation, edge cases)
   - {{COMPONENT}} Screen and {{COMPONENT}} Controls — if a mockup exists:
     layout, regions, states, marks, empty states, every control, keyboard
   - Data Model, Runtime / internals, API And Routes, Storage — as the sources allow
   - Seed or default content, if any
   - {{COMPONENT}} Roadmap — v1 scope, designed-beyond-PRD, ideas, out of scope
   - {{COMPONENT}} Open Questions — every place the sources disagree or leave a gap
   - {{COMPONENT}} Sources — file-by-file list of what each source contributed
   Use tables, mermaid diagrams and Obsidian callouts where they help.
   Quote the sources' own wording for rules. Do not invent facts: anything
   inferred (proposed endpoints, mappings, schemas) must be labelled as a proposal
   and listed in Open Questions.

4. Verify. Check every [[wikilink]] resolves to a note in the vault, and that every
   section number or file path you cite exists.

5. Update docs/FlowBoard/Component Documentation Tracker.md: set the component's
   status to ✅ and link its name to its index note, e.g. [[{{COMPONENT}} Index|{{COMPONENT}}]].

6. Commit with: docs: {{COMPONENT}} notes in the Obsidian vault
   Do not push. Report the worktree path, branch, commit, note list, and anything
   you inferred.
```

## Related

- [[Capability Library Index]]
