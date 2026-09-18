# Competitive analysis: Multica vs FlowBoard

**Date:** 2026-09-17 · **Subject:** [multica-ai/multica](https://github.com/multica-ai/multica) ([multica.ai](https://multica.ai))

Snapshot analysis. Figures below come from the GitHub API, Multica's README, and its published
security-model docs on the date above — all of it moves fast, so re-check before making a decision on it.

## Short version

They look like the same product on a screenshot and aren't.
**Multica orchestrates *agents*. FlowBoard orchestrates *steps*.**

- **Multica** — an issue tracker where the assignee can be an agent. One agent takes an issue
  end-to-end, comments as it goes, hands back a PR. Columns are *statuses*.
- **FlowBoard** — a pipeline engine with a board on top. One task is decomposed across a versioned
  DAG of headless sessions, each with its own model, budget, and gate. Columns are *steps*.

That single difference drives almost everything below.

## Side by side

| | **Multica** | **FlowBoard** |
|---|---|---|
| Unit of work | Issue → assigned agent | Task → flow (DAG of steps) |
| Topology | Fan-out across *agents* working separate issues | Fan-out / join / loop-back *within one task* |
| Columns mean | Status (todo / review / done) | Pipeline stage (research / plan / build / review) |
| Users | Multi-tenant: workspaces, roles, squads, Slack/Lark/DingTalk/WeCom/Telegram | Single user, no accounts, explicitly local-first |
| Deployment | Cloud (multica.ai), desktop, self-host (Compose/Helm); agents run on your runtime daemon | Your machine, your repos, your keys |
| Cost | Token usage shown *after* the fact. Docs mention **no** spend caps, budgets, or rate limits | Per-step budget caps, per-stage and per-task dollars, an explicit wasted-spend metric to attack |
| Safety | Docs state it "deliberately does not sandbox" — runs get the daemon user's full permissions and real `$HOME`; Codex runs `danger-full-access`; approval prompts auto-answered. Isolation is the deployer's job, outside the product | Sandbox per step with default-deny egress, as a core feature rather than a deployment note |
| Providers | 26 agent CLIs today | One seam, Claude Code first, Codex intended |
| Artifacts | Comments + diff on the issue | Real files in the task's isolated git workspace, with declared inputs/outputs the next step can rely on |
| Maturity | Shipping since Jan 2026; 50.2k stars, 6.5k forks, 1.6k open issues, near-daily commits; web/desktop/iOS | Design corpus; v3 app not yet built |
| Stack | Go (Chi, sqlc), PostgreSQL, Next.js, Electron, Expo | TBD |
| License | Custom Apache derivative with hosted-service / commercial-embedding / branding terms — **not OSI-permissive** | Ours |

## What this means commercially

**1. The overlap is larger than the differentiators.** Multica already ships board, inbox, review
gates, execution log, token usage, retries/timeouts, skills, self-hosting, provider-agnosticism, and
Slack. Strip those from the FlowBoard README and what is actually ours is two things: the **flow DAG
with per-step budgets**, and the **sandbox / egress model**. Everything else is table stakes someone
else already shipped.

**2. Both of those are durable, for different reasons.** The sandbox is durable because Multica made
*not* sandboxing an explicit design position — reversing it breaks their unattended auto-approve
model. Budget caps are simply absent from their docs. The DAG is the softer one: Squads with a
routing leader, plus Autopilots, plus Skills is adjacent enough that a pipeline feature is a quarter
of work away for them, not a rewrite.

**3. The feature-map ideas point straight at their turf.** Nearly every `💡` in
[feature-map.md](./feature-map.md) is multi-user: owners per task, @mentions, per-project access,
separation of duties, two-person sign-off, routing to a reviewer. That is a deliberate walk from
"local control room for one dev" into "team workspace" — the exact axis where an eight-month head
start, 50k stars, mobile apps, and five chat integrations beat us on every dimension that isn't the
pipeline. Multi-user is also what forces accounts, tenancy, and hosted infra, which kills the
local-first simplicity that makes this buildable by one person.

**4. Treat the star count as marketing signal, not adoption.** 50k stars in eight months with 1.6k
open issues is a launch curve, not proven retention. It says the *category* is hot and funded; it
does not say they have won it.

**5. Not a reuse candidate.** Multica is a whole platform under a non-OSI license carrying
hosted-service and commercial-embedding terms, not a component to mount behind one of our ports.

## Positioning that survives contact

> Multica is Linear-for-agents: it makes many agents visible to a team. FlowBoard is a pipeline: it
> makes one agent's work decomposable, budgeted, and safe to leave running unattended.

One sentence to test with users:

> **Multica assumes you trust the agent and want to see it. FlowBoard assumes you don't, and caps it.**

That is defensible. "Kanban board for coding agents" is not — that race is over.

## Open decision

The multi-user ideas in the feature map and the local-first, single-user, sandboxed positioning are
mutually exclusive as a solo build. Pick one before the PRD firms up.

## Sources

- <https://github.com/multica-ai/multica> — README, feature list, self-hosting
- GitHub API `repos/multica-ai/multica` — stars, forks, issues, created 2026-01-13, language Go, license `NOASSERTION`
- <https://multica.ai/docs/security-model> — execution isolation, sandboxing position, absence of budget controls
