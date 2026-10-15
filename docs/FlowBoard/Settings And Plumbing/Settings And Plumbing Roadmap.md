---
tags: [flowboard, settings-and-plumbing, roadmap]
module: Settings And Plumbing
---

# Settings And Plumbing Roadmap

## v1 scope (PRD)

| Item | Milestone | Source |
|---|---|---|
| Next.js, Tailwind, shadcn, Drizzle, schema, migrations | **M1 — Foundation** | PRD §14 |
| Worker process, job queue, SSE session viewer | **M3 — The runner** | PRD §14 |
| Inbox SSE for Slack reconciliation | **M6** (reconciliation both directions) | PRD §10, §14 |
| Draft mode toggle | not assigned; sits beside `/costs` (**M8**) in §13 | PRD §13, §14 |
| Sandbox settings section | not assigned | PRD §11.1, §13 |
| Memory settings section | **M9**, optional | PRD §11.2, §13, §14 |
| Thin REST handlers | every milestone | PRD §12 |

Acceptance (PRD §16):

- [ ] *"`pnpm dev` starts Next.js and the worker together"*
- [ ] *"Draft mode forces every step to haiku/low"*
- [ ] *"With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition"*
- [ ] *"Recall and commit happen host-side; a sandboxed run needs no egress-allowlist entry for the memory store"*

## Backlog items

| Story | Item | Tag |
|---|---|---|
| 0.2 | `pnpm test` on a throwaway `VIBE_DB_PATH`, concurrency 1 | FIX |
| 0.3 | Port 3111; `.gitignore` entries; plugin store in `.git/info/exclude` | FIX |
| 1.1 | 14 tables plus `runs.model`, `runs.effort`, `step_instances.reason` | PRD/FIX |
| 1.1 | `runs.sandbox`, `settings.sandbox_profile`, `step_defs.sandbox_profile` | NEW |
| 1.1 | DB singleton: WAL, `busy_timeout 5000`, `foreign_keys ON`, `globalThis`, `VIBE_ROOT`/`VIBE_DB_PATH` | FIX |
| 1.1 | Migrations via drizzle-kit; migrator on first open | PRD |
| 1.3, 7.2 | JSON error bodies; one error-handling style | BUG |
| 2.2 | Polling hook: `no-store`, catch errors, error state | BUG |
| 3.2 | Draft mode records actual model/effort | PRD/FIX |
| 3.4 | SSE tails `run_events`, replays from `Last-Event-ID`, sends `end`; dedupe by `seq`; stream-lost state | PRD, BUG, GAP |
| 3.5 | Draft mode and sandbox profile compose as `RunSpec` transformers | NEW |
| 4.3 | Inbox SSE snapshot stream; collapse three pollers into one; lost-orchestrator card | PRD, BUG |
| 6.1 | `escalation_threshold_ms` setting, default 5 min | PRD/NEW |
| **8.3** | **Settings: draft mode toggle; theme light/dark/system (class before first paint, `?theme=`); escalation threshold in minutes** | **PRD/NEW** |
| 9.1 | Tokens on `:root` and `.dark`; markdown readable in both themes | handoff, BUG |
| 9.2 | One summary poller for the chrome | handoff |
| 9.4 | `aria-live` on the lost-connection banner | BUG |
| 10.2 | README: SSE tail deviation, port 3111 | PRD |

## Designed beyond the PRD

| Design | Where |
|---|---|
| Draft mode as a `SpecTransform`, composable with *"force-local-model, cap-budget-globally, pin-a-model for an incident"* | `06` §15 |
| Every port called from a lib layer, never from a route | `06` §15 |
| Board as a materialized view refreshed on job completion | `02` §4 |
| Append-only usage journal | `02` §1 |
| Provider-neutral schema renames (`agent_session_id`, `runs.provider`) | `02` §1 |
| Connection states and the lost-orchestrator card | old design handoff |
| Server actions alongside REST routes; no client state store | drawio *Harness architecture* |
| Lint rule enforcing `core/` → `core/ports` only | architecture `README.md` |

## Ideas

Feature map §19 and §20 both have empty idea slots (*"💡 Ideas: _(add ideas)_"*). Ideas elsewhere that would touch this layer:

- **Teams & collaboration** (*Across everything*): *"identities for the people involved, light roles and permissions (who can edit recipes, approve gates, install skills, see costs, open a repo), and a *who* stamped on every human approve/reject/answer"*. Settings would become per person or per team.
- **A shared team tier** (Parking lot): *"accounts, roles, per-repo access, and runs that happen on a shared server rather than one laptop"* — would need auth on the API and a server database.
- **Kick off work from outside** (Parking lot) and the drawio *Schedule trigger (later)*: *"cron-style rows in jobs"* — new job kinds through the same queue.
- **Langfuse (later)**: *"self-hosted traces via a plain OTel exporter from NormalizedEvent"* (drawio; PRD §7 OTel naming).

## Out of scope

PRD §17: *"Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly."* And: *"shipping or *deploying* FlowBoard itself in a container is out of scope."* PRD §2: *"No auth, no multi-tenancy, no user table. Do not add them "for later""*.

## Related

- [[Settings And Plumbing Index]]
- [[Settings And Plumbing Open Questions]]
- [[Settings And Plumbing Sources]]
