---
tags: [flowboard, projects, idea, teams]
module: Projects
---

# Project Visibility

> **💡 Who can see each project** — *a teammate can be given access to a project and its repo, or not, so not everyone sees every codebase.* (feature map §1, Ideas)

An idea, not a v1 feature. It is the tracker's *"visibility"* in this component's scope line.

## It conflicts with the v1 rules

| Source | Wording |
|---|---|
| PRD §1 | *"Single user, runs on my machine, no auth."* |
| PRD §2 | *"No auth, no multi-tenancy, no user table. Do not add them 'for later'"* |
| PRD §17 | *"Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace"* |
| Drawio *Out of scope (v1)* | *"Auth, accounts, roles, deployment, Docker, multi-machine, plugin marketplace."* |
| Design brief | *"One user, no login, no onboarding, no marketing surface."* |

Visibility needs identities, and v1 has none.

## Where the idea leads

The feature map treats it as part of one cross-cutting foundation:

> **Teams & collaboration** — *the cross-cutting foundation every team idea above sits on: identities for the people involved, light roles and permissions (who can edit recipes, approve gates, install skills, see costs, open a repo), and a *who* stamped on every human approve/reject/answer in the record.* (feature map, *Across everything*)

Its own note splits the path in two: *"Local-collab first — named people, assignees, and per-person routing need no accounts server; full roles and per-repo access are the heavier, later step."* Per-project visibility is in the **later** half.

The parking lot names the end state: *"A shared team tier — the multi-user version: accounts, roles, per-repo access, and runs that happen on a shared server rather than one laptop."*

`docs/competitor-multica.md` counts it among the multi-user ideas that walk FlowBoard toward a competitor's ground: *"Nearly every `💡` in feature-map.md is multi-user: owners per task, @mentions, per-project access, separation of duties, two-person sign-off, routing to a reviewer."*

## What it would touch

Inferred, so a **proposal**: an access list on the project would need to filter the projects list, the board, the cross-project inbox, `/costs`, the library and the monitor, because each one reads across or within projects (see [[What Belongs To A Project]]). It would also need the repo itself to be unreadable to the excluded person, which a local-first tool on one laptop cannot enforce. Listed in [[Projects Open Questions]] #18.

## Related

- [[Projects Roadmap]]
- [[Projects Overview]]
- [[Personal Routing And Ladders]]
