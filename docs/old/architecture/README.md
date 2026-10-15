# FlowBoard — Architecture & Genericization

Derived from [`../PRD.MD`](../PRD.MD) and [`../REBUILD-BACKLOG.md`](../REBUILD-BACKLOG.md).
This set treats the spec as one concrete instance of a more general system and documents
how to build the general version — the one where **Claude Code and Codex are interchangeable adapters**,
not the substrate.

## The idea, in one paragraph

FlowBoard is a **durable workflow engine + human-in-the-loop protocol + cost ledger**,
specialized to orchestrate *headless coding-agent CLIs*, wearing a Kanban board as its read model.
A task flows through a **versioned DAG** where each node is an automated agent invocation with its own
model/effort/permissions. Some nodes auto-advance; some park for approval or answers. Strip away the
Claude-specific plumbing and what remains is a general async workflow orchestrator.

## The agentic graph

The spine of FlowBoard is an **agentic graph** — a directed graph whose *nodes are AI invocations* and whose
*edges carry artifacts*, not control flow alone. The spec names it **Flow** (PRD §4: "a versioned DAG of step
definitions"); this section names the concept plainly, because it is the mental model everything else hangs off.

- **Nodes** (`step_defs`) are agent or skill invocations, each pinned to its own model, effort, permissions,
  and tool policy.
- **Edges** (`step_edges`) are *typed transitions* — `always | on_pass | on_fail` — so the graph branches on an
  upstream node's **outcome**, not merely on completion.
- **Artifacts flow along the edges.** A node declares `requires` / `produces` artifact types, and the graph is
  valid only if every `requires` is produced by an ancestor (checked at design time — component 2). It is a
  *dataflow* graph, not a call sequence.
- **Topology beyond a chain:** fan-out (one node → many concurrent), join (many → one, waits for all), and
  loop-back (`on_fail` to an earlier node, guarded by `max_attempts`). This is what separates it from a linear
  agent pipeline.

What makes it more than a prompt chain, and worth the machinery:

- **Versioned and immutable** — editing the graph forks a new version; a task pins its version at start, so
  in-flight work never shifts under a graph edit.
- **A projection, not the model** — the board column is *derived* from a task's furthest-advanced node; the
  graph is the source of truth (component 4).
- **Provider-agnostic** — the graph references *logical* models and capabilities, so the same agentic graph
  runs on Claude Code, Codex, or a replay adapter unchanged. That is the entire point of the [ports](./01-ports.md)
  below.

Defined and validated in [component 2](./02-core-and-engine.md#2-flow-definition--validation); executed —
fan-out, join, rework, gates — by the engine in
[component 3](./02-core-and-engine.md#3-flow-execution-engine-write-model).

## What the spec already got right

The genericization work is mostly **naming the ports the spec already implies and adding a second adapter**:

- `run_events.type` normalizes to 7 event kinds → *already the provider seam*.
- Artifacts on disk with declared `requires`/`produces` contracts → storage-agnostic, design-time-validated boundary.
- Flow versions as immutable JSON, pinned per task → portable, shareable config.
- Board = projection of `step_instances` → CQRS; read model derived from write model.
- Park/resume via prompt replay → *a provider-agnostic HITL primitive hiding under the MCP sugar*.
- Job queue decoupling route handlers from process spawning → the worker can become a fleet later, for free.

## Thesis: ports & adapters (hexagonal)

Today the spec bleeds adapters into the core: the runner builds `claude` flags inline (§7), the question
loop assumes MCP (§9), Slack is named directly (§10), isolation is hardwired to git worktrees (§11).

**Dependency rule for the rebuild:** the domain (flow engine, board projection, question protocol,
cost ledger) depends only on **ports**; everything provider-specific is an **adapter** behind one.
`core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule.
If adding Codex requires touching anything outside `adapters/agent/codex/` plus a couple of capability
checks, the abstraction leaked.

### The five ports that carry the whole program

| Port | Today (only adapter) | Unlocks |
|---|---|---|
| **AgentProvider** | Claude Code CLI | Codex, Gemini CLI, `ReplayProvider` (tests) |
| **Notifier** | Slack Block Kit | Discord, email, webhook, desktop |
| **Workspace** | git worktree | devcontainer, Docker sandbox, remote |
| **ArtifactStore** | worktree files | S3/remote, content-addressed |
| **TaskSource** | markdown import | GitHub Issues, Linear, Jira, webhook |

Full interface sketches: [`01-ports.md`](./01-ports.md).

**Sandboxed execution** — running each step in a container or microVM — rides on the Workspace port via an
`ExecHost` seam (any provider × any isolation tier), and is the recommended default whenever `bypassPermissions`
is on. Threat model and design: [08 — sandboxing](./08-sandboxing.md).

**Agentic memory** — a **sixth, additive port, `MemoryStore`** (a `local` SQLite adapter first,
[Mem0](https://github.com/mem0ai/mem0) later, self-hosted) — gives runs memory *across* tasks: the operator's standing decisions, a
project's conventions, what an agent has learned. It is **not** load-bearing — a flow runs unchanged with it off
— but it turns "start cold, re-learn, re-ask" into "start warm", which is a **wasted-spend** control (§12) as
much as a quality gain. The runner brokers it host-side (recall before a run, commit after), so it stays off the
sandbox egress allowlist. Design: [09 — memory](./09-memory.md).

## Suggested module layout

```
core/            # depends on NOTHING provider-specific
  flow/          # def, validation, board_order            (02)
  engine/        # advancement, fan-out, join, rework       (02)
  hitl/          # question protocol, park/resume           (04)
  cost/          # ledger + pricing                         (06)
  memory/        # recall before a run, commit after        (09)
  ports/         # AgentProvider, Notifier, Workspace, ArtifactStore, TaskSource, MemoryStore
adapters/
  agent/claude/  codex/  replay/                            (03)
  notify/slack/  discord/  email/                           (04)
  workspace/worktree/  container/                           (05)
  source/markdown/  github/                                 (05)
  memory/mem0/  local/                                      (09)
runner/          # generic execution loop — imports ports, not adapters (03)
worker/          # queue + lifecycle                        (03)
app/             # Next.js routes + UI                      (03, 06)
```

Runnable reference implementations of the ports and two example adapters live under
[`reference/`](./reference/) — a mirrored `core/` + `adapters/` subtree. See
[07 — Ports in practice](./07-ports-in-practice.md).

## Component index (catalog is 1:1 addressable)

| # | Component | Doc |
|---|---|---|
| 1 | Domain model & migrations | [02](./02-core-and-engine.md#1-domain-model--migrations) |
| 2 | Flow definition & validation | [02](./02-core-and-engine.md#2-flow-definition--validation) |
| 3 | Flow execution engine (write model) | [02](./02-core-and-engine.md#3-flow-execution-engine-write-model) |
| 4 | Board projection (read model) | [02](./02-core-and-engine.md#4-board-projection-read-model) |
| 5 | AgentProvider abstraction ⭐ | [03](./03-execution-substrate.md#5-agentprovider-abstraction) · [ports](./01-ports.md#agentprovider) |
| 6 | Runner / execution host | [03](./03-execution-substrate.md#6-runner--execution-host) |
| 7 | Job queue & worker lifecycle | [03](./03-execution-substrate.md#7-job-queue--worker-lifecycle) |
| 8 | Event stream & live viewer | [03](./03-execution-substrate.md#8-event-stream--live-viewer) |
| 9 | Human-in-the-loop protocol | [04](./04-hitl-and-notify.md#9-human-in-the-loop-protocol) |
| 10 | Notification / escalation → Notifier port | [04](./04-hitl-and-notify.md#10-notification--escalation--notifier-port) |
| 11 | Artifact store & workspace → two ports | [05](./05-environment-and-registry.md#11-artifact-store--workspace--two-ports) |
| 12 | Cost & usage ledger + PricingService | [06](./06-cost-and-platform.md#12-cost--usage-ledger--pricingservice) |
| 13 | Skill/Agent registry → Capability packs | [05](./05-environment-and-registry.md#13-skillagent-registry--capability-packs) |
| 14 | Ingestion → TaskSource port | [05](./05-environment-and-registry.md#14-ingestion--tasksource-port) |
| 15 | Settings, draft mode, API | [06](./06-cost-and-platform.md#15-settings-draft-mode-api) |
| 16 | Agentic memory → MemoryStore port (additive) | [09](./09-memory.md) |

Each component is documented as **Role · Seam · Genericize · Composes with · Idea**.

## Open decisions (raised, not resolved)

1. **StepExecutor generalization** (component 3): `shell` steps are now in scope (they are the mechanical
   check behind every pass/fail). Still open: make `step_defs.kind` an executor interface so a step can
   also be an HTTP call, pure transform, or human task — turning FlowBoard
   into a general workflow engine that *ships* AI executors. Widens the engine's core interface. Documented
   as optional in [02](./02-core-and-engine.md#3-flow-execution-engine-write-model).
2. **ACP + Codex spike before the port hardens.** First: could the AgentProvider port *be* the Agent Client
   Protocol (ACP), with Claude Code and Codex adapters, instead of a parser per vendor? Then validate against
   Codex's real CLI (session/resume, cost reporting, MCP exposure) before committing the shape. See [01](./01-ports.md#validating-the-port).
3. **Sandbox posture** ([08](./08-sandboxing.md)): default isolation tier (host vs container), container vs
   gVisor/microVM strength, and ~~HITL-in-sandbox~~ (decided: host-side broker on every tier, see [08](./08-sandboxing.md)). Recommendation: container +
   egress allowlist whenever `bypassPermissions` is on. Tracked as D7–D9 in the backlog.
4. **Memory posture** ([09](./09-memory.md)): self-hosted Mem0 (keeps it local-first) vs the managed platform
   (the shared/remote tier); which scopes are on by default; and the cross-run trust boundary — recalled
   memories are context, not instructions, and writes come only from declared artifacts/answers. Recommendation:
   `local` adapter first, Mem0 self-hosted only once memory pays off; additive/off by default, `user` scope first. Off the egress allowlist because the runner brokers it.
5. Plus the spec's own open items (`docs/REBUILD-BACKLOG.md` §"Decisions to close"): auto-start vs explicit
   Start, undo window, hook isolation, import parser shape. (`max_attempts` semantics: decided, PRD §8.)
