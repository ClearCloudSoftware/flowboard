---
tags: [flowboard, execution, roadmap]
module: Execution
---

# Execution Roadmap

What is in v1, what the designs add beyond the PRD, ideas, and what is out of scope.

## v1 scope (PRD)

| Milestone | Execution content | PRD §14 wording |
|---|---|---|
| M2 | Promote creates a worktree; *"No agents run yet."* | *"Tasks and board, no automation."* |
| **M3** | Worker, job queue, one hardcoded step, stream-json → `run_events`, SSE viewer, cost | *"**This is the milestone that proves the whole idea.** Do not proceed until you can watch a real session stream in the browser and see its cost land in the database."* |
| M4 | Park and resume | *"MCP server with `ask_user_batch`, blocking with the 20-minute sentinel … park-and-resume."* |
| **M5** | The engine (built first, by run-flow: see below) | *"Step defs, edges, fan-out, joins, conditional edges, approval gates, rework loops with `max_attempts` escalation, shell check steps, artifact contract validation."* |
| M6 | The `escalate_question` job | *"Slack escalation. 5-minute timer, Block Kit rendering, interaction handler, idempotency and reconciliation both directions."* |
| M7 | The `import_backlog` job | *"Library and import. Skills install from GitHub, agent CRUD, markdown backlog import."* |
| M9 | Memory recall and commit around a run | *"Memory (optional, additive)."* |

As built in run-flow (2026-10-23), the order changed: M5's engine came first, in `core/src/flow/`, ahead of M3's worker, job queue, SSE viewer and database and M4's parking (the run-flow plan: *CLI or worker first: CLI*). The terminal command `run-flow` hosts it, with steps and routes from a YAML file: fan-out, joins, conditional routes, approval gates, rework with `max_attempts` escalation, shell checks and the `requires`/`produces` contract. Runs stream to the terminal and to JSONL logs, and their costs land in `state.json`; no API sits in front of the engine yet. The worker is to run the same engine ([[Multi-Agent Orchestration Analysis]] §6.6). See [[Run Flow Reference]].

Draft mode (PRD §13) is assigned to no milestone. PRD §13 describes the toggle right after the `/costs` views, which M8 builds, and the drawio puts it on the costs screen (*"rollups and draft-mode toggle"*, *Logical components*), so M8 is the likely home (*inference*). The backlog implements the override in the runner (3.2) and the toggle in settings (8.3).

The pitch counts *"eight build milestones"*, ending with *"the cost/sandbox views"*. It leaves out M9 memory, and names the sandbox views where PRD §14's M8 has the flow editor UI.

Sandboxed execution (PRD §11.1) is *"in scope but optional"* (PRD §17).

## Designed beyond the PRD

A status's *run-flow:* part says what the terminal host had built by 2026-10-23 ([[Run Flow Reference]]).

| Item | Where | Status |
|---|---|---|
| Explicit **Start** button | backlog 2.1, D1, drawio | decision default, not in PRD §12 |
| **Demote** keeping the worktree | backlog 2.1 (**NEW**) | no endpoint |
| **Pause** a task | feature map §3 (named), task-detail guide (rule) | no status, no endpoint. *run-flow:* partly: Ctrl+C, or a spent flow budget, stops the live runs mid-flight and `--resume` carries on; nothing pauses after the current run |
| **Retry as-is**, **Allow host & retry** | monitor and inbox mockups | not in PRD. *run-flow:* Retry as-is is built as Retry this step at a *run failed* gate (the same attempt, not counted); Allow host waits for the sandbox's egress allowlist |
| `queued` as a visible step state | monitor and task-detail mockups | not a PRD state. *run-flow:* on the run record, not the step: a run is `queued: true` in `state.json` until it launches, while its step shows `running` |
| Worker slots strip with per-slot Stop | monitor mockup | cap from `VIBE_MAX_RUNS` |
| Restart re-attach by pid | `03` §7, backlog 3.3 | fix (backlog **BUG**). *run-flow:* no re-attach: the next run-flow in the folder, or `--resume`, stops what a dead host left running, by the pids in its run logs (Alex's call, 2026-10-23), and `--resume` reruns those runs |
| Graceful shutdown → `cancelled` | `03` §7, backlog 3.3 | backlog **GAP**. *run-flow:* built differently: SIGTERM and SIGHUP stop the flow as Ctrl+C does, and its runs are recorded `interrupted` (wasted), not cancelled, for `--resume` |
| `RunSpec` transformer chain | `06` §15, backlog 3.5 | architecture |
| Run spec snapshot and replay | `03` §6, drawio *Run records* | idea. *run-flow:* the snapshot is built, as each run log's `start` line plus the run folder's `flow.json`; nothing replays a run |
| Logical model ids | `01-ports.md` | architecture ([[Logical Model Ids]]) |

## Ideas

From feature map §4 *💡 Ideas*:

- **Route the next human step to a teammate**: *"when a step finishes, the engine drops the following approval/manual step into another person's queue (a finished build sends code-review to the reviewer), who can start their own work from there."*
- **Two sign-offs on one gate**: *"a step can require approval from two people (say security and a lead) — the same "join" that waits for parallel branches, applied to humans."*

From the architecture:

- **StepExecutor**: *"generalize `step_defs.kind` (`skill|agent|shell|manual`) into a **StepExecutor interface**"* (`02` §3; README open decision 1).
- **A fleet**: *"the worker can become a fleet later, for free"* (README); *"allows remote executors or a fleet without touching the core"* (`03` §7).
- **A materialised board**: *"expose it as a **materialized view refreshed on job completion** instead of client polling"* (`02` §4).
- **Scheduled flows** (drawio *Schedule trigger (later)*): *"cron-style rows in jobs → maintenance flows: knowledge-asset refresh, nightly gates"*.
- **Deterministic gates** (drawio, *later*): *"semgrep · gitleaks · trivy · eslint / ruff as extra shell steps: $0 catches before any model reviews"*.
- **Injection scan** (drawio, *later*): *"LLM Guard over artifacts before the next step or memory trusts them"*. The feature map parking lot has the same idea: *"Check for hidden manipulation"*.

From the feature map parking lot:

- *"Run agents in the cloud, not just your laptop"*
- *"Auto-pick the AI per step"*
- *"Kick off work from outside — start a task straight from a GitHub issue, a Slack message, or on a schedule."*
- *"More steps that aren't AI — … A step could also call a service or be a simple human checklist."*
- *"Replay any past run — step through exactly what happened, to debug it after the fact."*

## Out of scope

PRD §17: *"Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI."* For execution, that rules out remote workers and multi-machine runs in v1. *"**Sandboxing agent execution** … is in scope but optional — it isolates the agent on the same single machine; it is not multi-tenancy or remote execution."*

The build went past the `claude` CLI: OpenCode, built on 2026-10-18 as a second provider, runs other models through `opencode`. Whether it is in v1 is [[Agent Providers Open Questions]] #38.

As built in run-flow (2026-10-23), each step names its adapter (the run-flow plan: *Provider per step*), so one flow can mix them: `claude-code` steps still go through the installed `claude` CLI, by way of the Agent SDK, and `opencode` steps go through OpenCode to the provider their `provider/model` id names. The rule that every model call goes through the `claude` CLI now holds for Claude steps only.

## Related

- [[Execution Index]]
- [[Execution Open Questions]]
- [[Execution Testing]]
- [[Agent Providers Roadmap]]
- [[Sandboxing Roadmap]]
- [[Workspaces Roadmap]]
- [[Memory Roadmap]]
