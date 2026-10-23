---
tags: [flowboard, analysis, execution, flow-design, agent-providers]
date: 2026-10-19
---

# Multi-Agent Orchestration Analysis

How FlowBoard could run several agents as one piece of work, measured against [yamlgraph](https://github.com/sheikkinen/yamlgraph). This is an analysis only. Nothing was built.

> As built (2026-10-23): the shape in section 6 became the `run-flow` command. Notes marked *as built* say where it departs from this analysis; [[Run Flow Reference]] has the rules as built.

Sources read:

- the [[Execution Index|Execution]] and [[Flow Design Index|Flow Design]] notes on `dev`;
- the code on `feature/agent-providers` at `e24a515`, which is not yet merged into `dev`: about 2,300 lines of source in `code/flowboard/packages/`;
- yamlgraph v0.6.5 at commit `00742bd` (2026-10-14). Its code was read, not run.

## Short version

- **yamlgraph already does a version of this.** Its `type: copilot` node runs one coding-agent CLI as one step of a YAML-defined graph: Claude Code (`claude -p`), OpenCode (`opencode run`) or GitHub Copilot CLI. yamlgraph compiles the graph onto LangGraph.
  - Its graph layer is mature: a schema, a linter with about 90 rules, loop limits, fan-out over a list, human pauses, subgraphs and a Mermaid export.
  - Its agent node is thin. It waits for the process to exit, then reads one JSON result. There is no live event stream, no cost tracking, no isolated working folder and no error policy.
- **FlowBoard is the mirror image.**
  - The agent node is built. `AgentProvider` streams normalized events, reports usage and cost, enforces guards and permission modes, answers `ask_user` questions and stops cleanly.
  - The graph layer is designed in detail (about 60,000 words across Execution and Flow Design) and not built.
  - The only YAML today describes a single run.
- **Take yamlgraph's front door and tooling, not its runtime.** That means:
  - one YAML file per flow, with prompts in their own files;
  - a validator you run before spending money, plus a diagram;
  - one command to run the flow;
  - a handful of contracts yamlgraph learned the hard way (section 10).

  LangGraph's runtime fits long, expensive steps that change files badly. yamlgraph's own investigations ran into exactly those limits.
- **Recommendation:**
  - Grow `run-agent`'s single-run YAML into a flow YAML.
  - Write the engine as pure functions in `packages/core`, where the design already puts it.
  - Host the engine first in a `run-flow` terminal command. The worker, job queue and web app come later and reuse the same engine.
  - Don't adopt LangGraph.js.
- **Three decisions only you can make:**
  - Do YAML files become the source of truth for flows? The design keeps them as database rows edited on a canvas.
  - Does each step name its provider? It now needs to be able to.
  - How do parallel coding steps share one folder?

## 1. What FlowBoard has today

### 1.1 Built: one agent, one run

What `feature/agent-providers` gives an orchestrator, and what each package lacks for running several steps:

**`@flowboard/core`**
- The `AgentProvider` port: `launch(RunSpec)` returns `events`, `result` and `stop()` (`ports/agent-provider.ts:199-207`).
- `RunSpec` already has slots for the artifact contract, `prompt.inputs` and `prompt.outputs` (`:83-96`). It also carries model, effort, tool policy, MCP tools, capabilities, `cwd`, `exec`, `resume`, limits, permission mode, system prompt and guards (`:133-162`).
- `RunResult.outcome` is documented as *"Unset is NOT 'pass'"* (`:171-172`).
- `renderPrompt` prints *Read these first* and *Write your output to* (`prompt.ts:7-18`).
- The guard rules and their checker (`guard.ts:30-48`).
- The ask protocol, including the worker's future *no answer yet* reply (`hitl/question.ts:36`).
- Lacks: flow, step, edge and step-instance types; the engine; the validator; fingerprinting.

**`@flowboard/adapters`**
- Claude Code (the Agent SDK with your `claude` login), OpenCode (its local server), Replay (scripted events at $0) and the `host` ExecHost.
- Lacks: neither real adapter ever sets `outcome`. Only Replay does (`replay-provider.ts:50-63`).

**`@flowboard/ask-user`**
- A stdio MCP server with `ask_user` and `ask_user_batch`, forwarding to a broker over a Unix socket.
- Lacks: `set_outcome` and `declare_artifact`. PRD §9 puts both on this server.

**`@flowboard/cli`**
- `pnpm run-agent task.yaml`: YAML checked with zod and turned into a `RunSpec` (`config.ts:35-65`, `181-209`), a terminal broker for questions, a JSONL log and exit codes.
- Lacks:
  - One file is one run ([[Run Agent CLI Decisions]] R1). The YAML design's non-goal: *"Several runs, named agents or multi-step flows in one file"*.
  - `inputs` and `outputs` are always empty (`config.ts:184`).
  - Deferred issue: *"A run cannot say which files it must produce"*.

The run-agent YAML is already most of a step definition. Section 6.2 maps it field by field.

### 1.2 Designed, not built: the engine

The two components describe a durable graph engine whose nodes are agent sessions.

**The recipe ([[Flow Design Index]]).**
- A flow version is an immutable graph of step definitions and edges. A task pins its version when it starts ([[Version Pinning]]).
- A step is one of three kinds ([[Step Kinds]]):
  - `ai`: an agent, a skill, or both;
  - `shell`: a command whose exit code is the verdict;
  - `manual`: not yet defined.
- Edges are `always`, `on_pass` or `on_fail` ([[Connections And Routes]]).
- Each step declares the artifact types it `requires` and `produces`. Saving is refused when a requirement has no producer upstream ([[Artifact Contract]], [[Flow Validation]]).

**The engine ([[Execution Index]]).** After a run, the engine sees only an outcome: `pass`, `fail` or none ([[Run Outcomes]]).

- **Advancing** ([[Advancement Rules]]):
  - An approval step, or a step with unanswered questions, stops and waits.
  - Any other step is marked done and its outgoing edges are resolved.
  - A step with conditional edges and no outcome goes to a human gate: *"A missing outcome is never a pass."*
- **Fan-out and join** ([[Fan-Out And Join]]): when several edges fire, all their target steps start at once. A join waits for every upstream step except those reached through `on_fail` edges.
- **Rework** ([[Rework Loop]]): an `on_fail` edge to an earlier step reruns that step with the failing step's raw artifacts, resets every step after it, and marks the superseded runs as wasted.
- **Loop guard** ([[Loop Guard And Escalation]], [[Stuck Detection And Fingerprints]]):
  - `max_attempts` defaults to 3 and counts the first run.
  - The count sits on the step that redoes the work, and every loop into that step shares it.
  - When the count is spent, or a check fails with the same output twice, the engine hands the decision to you instead of failing the task.
- **Crashes and rate limits** are retried by the runner and never use up an attempt ([[Infra Retries]]).
- **Done**: a task is done when nothing is active and no pending step can still be reached ([[Task Completion]]).

**Where it runs.**
- The web app enqueues jobs. A worker leases them from SQLite, and the runner turns one job into one run ([[Job Queue]], [[Worker Lifecycle]], [[Runner Pipeline]]).
- The engine, the prompt builder and fingerprinting live in `packages/core`, which imports no framework, database driver or CLI.

So in FlowBoard's own terms, "orchestrate multiple agents" means building this engine. The design already chose a fixed graph of steps over a supervisor agent that improvises. The [Multica analysis](../competitor-multica.md) puts it as *"Multica orchestrates agents. FlowBoard orchestrates steps."*

## 2. yamlgraph in one page

**Project facts**
- Python 3.11+, built on LangGraph and LangChain.
- 3 stars, 0 forks, 2,907 commits since 2025-12-22. Two contributor accounts, with most commits from the author. Version 0.6.5, classified Beta.
- MIT text plus an extra clause. GitHub reports NOASSERTION, probably because of that clause.
- About 27,100 lines in the package, with several times that in tests and examples.
- Core behaviour still changes between releases. For example, FR-1124 made `fail` the default error policy for LLM nodes.

**Files**
- A graph is a YAML file with `nodes`, `edges`, `defaults`, `state`, `loop_limits`, `loop_exits`, `config`, `checkpointer`, `verify` and `exports`.
- A prompt is a separate YAML file with `system`, `user` and an optional output `schema`.
- yamlgraph compiles both into a LangGraph `StateGraph` and generates the state type from the YAML.

**Node types.** Thirteen have runtime handlers:
- `llm` (the default), `router`, `agent` (a tool-calling loop), `python`, `passthrough`;
- `tool` (a shell command) and `tool_call`;
- `map`, `race`, `subgraph`;
- `interrupt`, `copilot`;
- `verify`, used internally.

**Data.** Data moves through one shared state dictionary. Each node writes its result under its `state_key`, and later nodes read it with `{state.a.b}` templates.

**Routing** comes in two forms:
- an LLM `router` node writes a route label;
- an edge carries a condition such as `critique.score < 0.8`. Conditions are checked in the order written and the first match wins. There is no `eval`, no parentheses and no `not`.

**Loops**
- `loop_limits` caps each node (`critique: 3`), and `loop_exits` says where to go when a cap trips.
- A run-wide `recursion_limit` defaults to 50.
- The linter warns about cycles that have no limit.

**Parallel work**
- `to: [a, b]` fans out to two nodes.
- A `map` node runs one sub-node per list item through LangGraph's `Send`. An accounting step checks completeness, and `min_success` sets how many items must succeed.
- There is no explicit join.

**People and persistence**
- An `interrupt` node pauses with a payload and stores the answer under `resume_key`.
- State persists through memory, SQLite or Redis checkpointers, keyed by a thread id.
- The CLI can only resume a paused run within the same process.

**Coding agents** run through `type: copilot` with `backend: claude | opencode | cli | api`:
- The CLI runs as a blocking subprocess with a default timeout of 300 s.
- The prompt is flattened into one string.
- The node stores `{output, exit_code, model, backend, session_id}` in state, so a later node can resume the session.
- For Claude it checks the CLI version and that a subscription login is active, and it strips `ANTHROPIC_API_KEY` from the child's environment. FlowBoard made the same call for its Claude provider.

**Tooling**
- `graph run`, `graph lint`, `graph validate`, `graph info`.
- `graph export --mermaid`, which can overlay the route a run actually took.
- A JSON Schema for editor completion.
- Tracing through LangSmith and OpenTelemetry, plus a JSONL log of routing decisions.

**Not there**
- Stated non-goals: graphs that change shape at run time, and sandboxing (*"Commands run with your user permissions"*).
- Missing: cost tracking, budgets, graph versioning, and a server or UI in the package.

A self-correcting loop from the repository (`examples/demos/reflexion/graph.yaml`, trimmed):

```yaml
edges:
  - from: critique
    to: refine
    condition: critique.score < 0.8
  - from: critique
    to: END
    condition: critique.score >= 0.8
  - from: refine
    to: critique
loop_limits:
  critique: 3
loop_exits:
  critique: END
```

## 3. Side by side

| | yamlgraph | FlowBoard design | FlowBoard code today |
|---|---|---|---|
| A node is | Mostly one LLM call; optionally one coding-agent CLI run | One coding-agent session, or one shell command | One coding-agent run (`run-agent`) |
| Node cost and time | Cents and seconds for an LLM call; a CLI run is not metered | $0.30 to $6 a step in the mockups; minutes | As designed |
| Graph defined in | A YAML file, plus prompt files | SQLite rows edited on a canvas; JSON for seeds | YAML for one run |
| Versions | None (git, if you use it) | Immutable versions, pinned per task | — |
| Data between nodes | One shared state dictionary | Files in the task's worktree; only the outcome is structured | — |
| Routing | LLM router labels; conditions on state | `always`, `on_pass`, `on_fail`; no outcome goes to a person | — |
| Parallel work | Static fan-out; `map` over a list; no join | Static fan-out; a join waits for all non-`on_fail` upstream steps | — |
| Loops | Per-node `loop_limits` and `loop_exits`; run-wide cap | Attempt budget on the rework target, shared by its loops; stop early on a repeated check failure; escalate to you | — |
| Errors | `on_error`: skip, retry, fail or fallback. Not on `copilot` nodes | Transient failures retried outside the attempt count; others block the task | The run exits 1 |
| People | `interrupt` node; the answer goes into state | Approval gates, `ask_user` mid-run, park and resume, inbox and Slack | `ask_user` in the terminal |
| Persistence | LangGraph checkpointer per thread; resume in the same process only | Jobs, step instances and runs in SQLite; re-attach by pid after a restart | A JSONL log per run |
| Cost | None | Live cost, per-step budgets, wasted spend | Budget cap and usage per run |
| Safety | None. The Claude backend can pass `--dangerously-skip-permissions` | Permission gate, in-agent guards, sandbox tiers with default-deny network | Guards; any-shell settings need an explicit opt-in |
| Checks before running | Linter with about 90 rules | Artifact contract, one entry, reachability, known types, provider capabilities | Config schema for one run |
| Picture | Mermaid export with a run overlay | Canvas and monitor screens | — |

## 4. Where they really differ

### 4.1 How big a node is

yamlgraph grew up around LLM calls that cost cents. A FlowBoard step is a whole agent session: minutes, dollars, many tool calls, and writes to a repository. Three things follow, and they explain why FlowBoard's engine rules look the way they do:

- **A rerun is expensive.**
  - Attempts are budgeted on the step that redoes the work.
  - Crashes don't use up attempts.
  - Superseded runs are counted as wasted spend.
- **The step's own verdict isn't trusted by default.**
  - A missing outcome goes to a person.
  - The review runs only after a real check command passes.
- **The orchestrator can't checkpoint inside a step.** The agent's context lives in its session. The orchestrator can only record the session id, the artifacts and the outcome.

yamlgraph's own usage points the same way. Its August 2026 node census (`docs/node-type-census-2026-08.md`) recommended retiring `agent`, `map`, `tool_call` and `verify`, and keeping `copilot` as an active node in its own pipelines. The recommendation was advisory, and `map` has since been hardened.

### 4.2 Files or a state dictionary

yamlgraph passes data in one dictionary. FlowBoard passes files: each step writes the artifacts it declared, and the next step reads their paths (*"map, not encyclopedia"*). For coding agents, files win:

- agents read and write files natively;
- files survive a crash;
- they can be diffed and reviewed;
- each step starts with a fresh context.

Keep files. The only structured value that has to cross between steps is the outcome. yamlgraph's own wrapper for its agent pipeline reached the same rule: *"verify by artifact, never exit code"* (`scripts/judge.sh:95`).

### 4.3 Routing

yamlgraph routes on any state value, or on a label an LLM picks. FlowBoard routes on pass and fail. Pass and fail cover the seeded flow and every role flow in the feature map's appendix.

A step that chooses between three branches, such as triage, would be a small extension:

- `set_outcome` takes one label from a list the step declares;
- each edge matches on a label;
- a step that sets no label still goes to a person.

Worth doing only when a real flow needs it.

### 4.4 Loops

yamlgraph caps each node and exits when the cap trips. The exit signal is one run-wide flag, `_loop_limit_reached`. Several node types set it to true, and nothing in the package sets it back. Every condition-based routing decision checks the flag first (`routing.py:77`). Read literally, once any node trips its limit, every later condition-based route in that run goes to its own loop exit, or to END if it has none. This is an inference from the code, not a documented behaviour.

FlowBoard's rules suit expensive steps better:

- The budget sits on the step that redoes the work, so a failed check and a failed review draw on the same three tries.
- A check that fails with the same output twice stops early.
- A spent loop hands the decision to you.

Keep FlowBoard's.

### 4.5 Parallel work

Both fan out statically. yamlgraph can also map a node over a list, which FlowBoard's design can't.

yamlgraph has no join in LangGraph's sense: it never uses the multi-source edge that waits for all branches. In LangGraph a node *"becomes active when it receives a new message … on any of its incoming edges"*, so a node fed by two branches of different length can run more than once. This is our inference from `compile/edge_compiler.py` and the LangGraph docs. FlowBoard defines a join explicitly.

Dynamic fan-out is the one capability yamlgraph has that FlowBoard's design lacks. An example: "the plan lists five subtasks, so run one implementer per subtask". It is also the hardest for coding agents. Five agents writing in one folder collide, so it needs a worktree per branch and a merge step afterwards. Defer it.

### 4.6 Surviving a crash, and resuming

yamlgraph inherits LangGraph's checkpoints, which are written only when a whole step of the graph ends. Its own investigation (`docs/investigations/fr1065-resumable-map.md`) found that `kill -9` *"loses every item of the step that was running, including items that had already finished"*. The project worked around it with a separate SQLite store of per-item results.

Resuming from the CLI works only within the same process. Resuming later means rerunning the graph and skipping nodes whose output is already set.

For steps that cost dollars and change files, FlowBoard's design is safer:

- explicit run, attempt and step-instance records;
- a step that parks with its session id, and later resumes that same session.

### 4.7 Where the graph lives

yamlgraph's graph is a file in a repository, and that is the whole philosophy. Its `ARCHITECTURE.md` lists why: *"Separation of concerns"*, *"Non-developers can create/modify pipelines"*, *"Diff-able, reviewable configuration"*, *"Schema validation catches errors before execution"*.

FlowBoard's design keeps flows as database rows edited on a canvas, with JSON for seeds and export as an idea. This is the biggest decision this note raises; see 7.2.

### 4.8 Cost and safety

yamlgraph has neither. Both are FlowBoard's reason to exist: the Multica analysis names *"the flow DAG with per-step budgets, and the sandbox / egress model"* as the only two things that are really FlowBoard's. Multi-agent flows make both matter more, because fan-out multiplies spend and loops multiply it again.

## 5. Ways to build it

**A. Use yamlgraph itself.** Write flows as yamlgraph YAML and run each step as a `copilot` node.
- Fine for a throwaway spike to feel a flow out.
- Not as FlowBoard's engine:
  - it puts Python next to a TypeScript codebase;
  - it is a mostly single-author beta whose semantics still move;
  - its agent node bypasses everything `feature/agent-providers` built: streaming, cost, guards and `ask_user`.

**B. LangGraph.js as the engine.** Port yamlgraph's architecture: compile the YAML to a LangGraph.js graph, and make each step a node that calls `provider.launch()`.
- Not recommended. It provides the easy parts (fan-out, cycles, pauses, checkpoints) and none of FlowBoard's rules.
- Its loop cap counts graph steps (25 by default), not attempts on one step.
- Parallel nodes share a graph step. In the Pregel model it uses, the next graph step starts only after all of them finish, so a quick branch waits for its slowest sibling before moving on.
- Its checkpoints can't hold a live agent session, and a crash reruns everything in the step that was running.
- Its state would be a second source of truth next to the tables the board, the cost ledger and the inbox read.
- The design says `packages/core` imports no framework.

**C. Own engine in `packages/core`, with a YAML front door.** Build the designed engine as pure functions, read flows from YAML, and host the engine first in the CLI, later in the worker.
- **Recommended.**
- It matches the design and needs no new dependency: `yaml` and `zod` are already in the workspace.
- Every FlowBoard rule stays first-class.
- My estimate is 1,000 to 1,500 lines plus tests, smaller than the providers branch.

**D. A supervisor agent.** One agent session hands work to subagents, using Claude Code's or OpenCode's own subagent feature.
- Not an orchestrator for FlowBoard. It has no per-step budget, gate, artifact contract or resume.
- It still combines with C: a step can use subagents internally.

**E. A durable-workflow service** such as Temporal, Inngest, Restate or DBOS.
- Out of proportion for a single-user tool on one laptop.

## 6. The recommended shape

### 6.1 The flow file

*Illustrative only. Every key name is a proposal, not a decision.*

```yaml
name: software-delivery
folder: ../my-project
task: task.md                     # title, body, acceptance criteria, non-goals
defaults:
  adapter: claude-code
  model: sonnet
  limits: { budget_usd: 2, max_turns: 40 }

steps:
  plan:
    agent: agents/architect.md    # the agent's system prompt
    model: opus
    produces: [plan]
    gate: approval
  implement:
    prompt: prompts/implement.md
    requires: [plan]
    produces: [implementation_notes]
  tests:
    adapter: opencode             # a second provider in the same flow
    model: openrouter/deepseek/deepseek-v4.1-flash
    requires: [plan]
    produces: [test_notes]
    write_roots: [tests]          # enforced by the guards, not only asked for in the prompt
  check:
    shell: pnpm lint && pnpm test # the exit code is the outcome
    produces: [check_output]
  review:
    skill: /code-review
    requires: [implementation_notes, test_notes, check_output]
    produces: [review]

edges:                            # one entry per step_edges row
  - { from: plan, to: implement }                     # fan-out
  - { from: plan, to: tests }
  - { from: implement, to: check }                    # check waits for both: the join
  - { from: tests, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail } # rework; spends implement's attempts
  - { from: review, to: implement, condition: on_fail }
```

- Routes go in a separate `edges:` list, as in yamlgraph, because the Flow Design canvas will read and write these files (decided 2026-10-19). Each edge has the fields of a `step_edges` row, and `condition` defaults to `always`. The first proposal put routes on the step they leave from.
- The task file feeds part 1 of every step's prompt. The step's own `prompt` is part 5 ([[Prompt Assembly]]).
- As built in run-flow (2026-10-23), the file has no `name:` key (a flow is named after its file) and no `agent:` key (a system prompt is run-agent's inline `system_prompt`); `--check` refuses both as `unknown key`. It has no `folder:` or `task:` either: a flow file is a reusable recipe, and each run gives them as `--folder` and `--task` (Alex's call). It needs a top-level `budget_usd:`, the most the whole flow may spend, 0 for no ceiling (Alex's call; the key's name and that it is required are Claude's, open to Alex's review). Its `prompt`, `skills` and `plugins` paths resolve against the flow file's own folder, so a recipe and its prompts move together (Claude's call, open to Alex's review). A top-level `entry: <step>` names the first step of a flow in which every step has a route into it. See [[Run Flow Reference]].

### 6.2 From run-agent keys to step keys

| `run-agent` key | Flow step key (proposal) | Designed column | Note |
|---|---|---|---|
| `adapter` | `adapter`, with a flow default | none yet | [[Flow Design Open Questions]] #9 was moot while v1 was Claude-only. Two adapters now exist |
| `model`, `effort` | same | `model`, `effort` | |
| `folder` | flow-level `folder` | the task's worktree | One folder per flow run. As built in run-flow (2026-10-23), the run gives it, `--folder`, not the flow file (Alex's call: a flow is a reusable recipe) |
| `prompt` | flow-level `task`, plus step `prompt` | task fields (part 1) and `prompt_template` (part 5) | As built in run-flow (2026-10-23), the task file is the run's `--task`, not a flow key |
| `system_prompt` | `agent` (a file) or `system_prompt` | `agent_id`, then `agents.system_prompt` | |
| `skill`, `skills`, `plugins` | same | `skill_id`, `extra_plugin_ids` | |
| `permissions.*` | same | `permission_mode`, `allowed_tools` | |
| `guards.deny_paths` | same, plus `write_roots` | the task's non-goals written as paths | `GuardRules.writeRoots` already exists |
| `limits.*` | same | `max_budget_usd`, `max_turns` | |
| — | `requires`, `produces` | same | Fills `prompt.inputs` and `prompt.outputs`, which are always empty today |
| — | `gate: approval` | `advance_mode` | |
| — | `max_attempts` | same | |
| — | `shell` | `kind = 'shell'`, `command` | |
| — | `edges:` (`from`, `to`, `condition`) | `step_edges` | Decided 2026-10-19 |
| — | derived | `is_entry` | The step no route points to. As built in run-flow (2026-10-23), a flow in which every step has a route into it names its first step with a top-level `entry:` (Claude's call, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]) |

### 6.3 The engine as one pure function

*Proposal.* The engine is one function. It takes the flow, the flow run's current state and one event, and returns the new state plus a list of things to do.

**Events**
- A run finished. It carries the outcome (or none), the artifacts written, the usage and, for a check, the fingerprint.
- A run ended in a way the runner could not retry.
- A person approved, rejected with a reason, retried with a note, or failed the task.
- Answers arrived.
- Cancel.

**Things to do**
- Start step S as attempt n, with these extra inputs.
- Open a gate on S, with a reason.
- Finish the flow as done, failed or cancelled.

All of PRD §8 lives in that function. That is what the design means by *"`packages/core` imports no framework, no database driver and no CLI."* The function can be tested with plain tables of state and event, and end to end with the Replay provider at $0. The host, which is the CLI now and the worker later, only stores the state and carries out the list.

As built in run-flow (2026-10-23), the function is `advance(flow, state, event)` in `core/src/flow/engine.ts`. Its events are `start`, `launched`, `run_ended`, `decide` and `resume`; its commands are `run`, `gate`, `stop` and `end` (`done` or `failed`). There is no answers event, because agents' questions are answered in the host while parking is left out, and there is no cancel. The engine is tested with tables of events; the host's end-to-end tests use a scripted provider, and one uses Replay.

### 6.4 The first host: `run-flow`

- `pnpm run-flow flow.yaml` validates the flow, then runs it in this process, with no database and no queue. This follows the same pattern as `run-agent`.
  - As built in run-flow (2026-10-23), a run names its folder and its task, `pnpm run-flow --folder <dir> --task <file> flow.yaml`, because a flow file is a reusable recipe (Alex's call). `--check` and `--mermaid` take both or neither.
- A concurrency cap limits parallel steps, playing the role of the design's `VIBE_MAX_RUNS`.
- The terminal handles questions, gates and escalations through the existing broker. The broker already queues several askers and answers them one at a time ([[Run Agent CLI Decisions]] R23).
  - As built in run-flow (2026-10-23), each agent run starts its own broker on its own socket, so R23's queue covers only one run's askers, and gates do not go through a broker. The host added its own turn-taking: one terminal asks gate prompts and every run's questions one at a time, and holds event lines while a prompt is open.
- Logs: one JSONL log per run, as today, plus one state file per flow run, written after every transition. `run-flow --resume <id>` continues after a crash or a closed terminal.
- Artifacts:
  - they are written to a fixed folder per flow run;
  - after each run they are found by modification time and matched to `produces` (PRD §6);
  - the agent reports its verdict with `set_outcome` on the existing MCP server.
  - As built in run-flow (2026-10-23), nothing scans for them. Each declared type has a fixed path, `<folder>/.flowboard/<run folder name>/<type>.md`, which the prompt names, and it counts as written only if its modification time is at or after the run's start. A file written anywhere else is not picked up, and a missing one opens a `did not write` gate.
- `run-flow --check` validates only, and `--mermaid` prints the graph.
- `run-flow` stays useful afterwards as the developer harness, like `run-agent`.

### 6.5 What changes where

| Package | Change |
|---|---|
| `core` | Flow types, the validator, the engine function and fingerprinting, all pure |
| `ask-user` | `set_outcome` (and later `declare_artifact`), on the same socket protocol |
| `cli` | `run-flow`, reusing `run-agent`'s field checks for each step |
| `adapters` | Nothing. That is the design's own test of the provider abstraction: *"zero provider strings"* outside the adapters |

As built in run-flow (2026-10-23), `set_outcome` does not use the socket. The ask-user server offers it only when `FLOWBOARD_OUTCOME_FILE` is set, and writes `{"outcome":"pass"|"fail","reason"?:string}` to that file. The host reads the file after the run and prefers it to `RunResult.outcome`, so a worker must read the file the same way or replace it. run-flow sets the variable only for agent steps whose routes or approval gate read the verdict (Claude's call, 2026-10-23, open to Alex's review). `declare_artifact` is left out.

### 6.6 Later: the worker

The same engine function runs in `apps/worker`:

- the state file becomes `step_instances` and `runs` rows;
- "start step" becomes a `start_run` job;
- gates and questions go to the inbox and Slack instead of the terminal.

The PRD's milestone order changes (it builds the worker and queue in M3, before the engine in M5). The design itself does not.

## 7. Decisions that are yours

**7.1 What did "but …" mean?** The request breaks off at "something similar to yamlgraph but". The answer may change everything below.

**7.2 Where flows live.** Three options:
- **(a)** YAML files in the repository are the source of truth. A task pins a snapshot, and the snapshot's content hash is the version. The canvas edits YAML later.
- **(b)** Database rows stay the source of truth, and YAML is only import and export.
- **(c)** Decide later. The engine takes a plain flow object either way.

My lean is (c) now and (a) eventually. Option (a) removes the version tables and the planned export and import feature in one move, and it makes flows reviewable in pull requests. Its cost is a canvas that writes YAML.

> [!check] Answered by run-flow, 2026-10-23
> A flow file is a reusable recipe (Alex's call): it holds no `folder` or `task`, and each run gives them, `pnpm run-flow --folder <dir> --task <file> flow.yaml`. Each run pins the copy it loaded in its run folder's `flow.json`, as (a) has a task pin a snapshot, but records no content hash (section 10). Whether the canvas edits files or database rows is still open. See [[Run Flow Reference]].

**7.3 CLI first or worker first.** My lean: CLI first. The engine's rules are the riskiest logic, and the CLI tests them on real agents without needing the queue, the database or the web app.

**7.4 Does a step name its provider?** My lean: yes, with a flow-wide default. The validator must then warn about each step's capability gaps. For example, OpenCode on a model with no price never trips `budget_usd` ([[Run Config Reference]]).

**7.5 Parallel steps in one folder.** Two options:
- **(a)** One folder, as `run-agent` uses. Each parallel step is limited by `write_roots` and `deny_paths`. The guards already enforce these on file-editing tools, but not on shell commands.
- **(b)** A git worktree per flow run, and per parallel branch, with a merge step.

My lean: (a) now, and (b) when dynamic fan-out arrives.

**7.6 Routing beyond pass and fail.** My lean: not yet.

**7.7 How a step reports its outcome.** Two options:
- **(a)** A `set_outcome` tool on the existing MCP server.
- **(b)** An `outcome` field in a JSON artifact.

The design allows both. My lean: (a), with (b) as the fallback for a provider without MCP tools.

## 8. Rules the engine must settle first

The engine encodes these rules, so each needs an answer before it is written.

| Question | Where it is tracked |
|---|---|
| Is `implement`, a rework target with several incoming edges, a join? | [[Execution Open Questions]] #4 |
| Which artifact carries the outcome, and which wins if both are set? | Execution #7 |
| How is "earlier step" decided for rework? | Execution #9 |
| Which runs count as wasted on rework? | Execution #17 |
| Do downstream steps reset their attempts? | Execution #18; [[Flow Design Open Questions]] #20 |
| Can a person approve over an agent's `fail`? Does a silent approval step get gated twice? | Execution #64, #71 |
| Does `attempts` count the first run? | Execution #66 |
| What happens to a join that sits behind a conditional route? | Flow Design #19 |
| Does an `on_fail` back-edge count as ancestry for validation? | Flow Design #22 |
| One entry step, or one producer per artifact type? | Flow Design #23; Execution #65 |
| What happens when one branch is blocked and the other is running? What does cancel do mid-fan-out? | Execution #49, #50 |

As built in run-flow (2026-10-23), every row has an answer; [[Run Flow Reference#Rules this command settles]] lists them. Since the plan, a flow in which every step has a route into it names its first step with `entry:` (Flow Design #23, Execution #65; Claude's call, open to Alex's review), and `--check`'s join warning also covers a conditional route further up (Flow Design #19).

## 9. Risks

- **Writes collide.** Parallel coding steps share one folder (Execution #48). The guards limit file-editing tools, but shell commands can still write anywhere.
- **A flow stalls quietly.** A join behind a route that never fires waits forever. Two things cover it: the design's done rule, *"no active instances and no reachable pending targets"*, and a validator warning.
- **Exit 0 does not mean done.** `run-agent` already shows this, which is why it prints failed tool calls and the last message (R17). In a flow, `produces` checks and the no-outcome gate close the gap.
- **Spend multiplies.**
  - Fan-out multiplies spend, and loops and attempts multiply it again.
  - OpenCode on an unpriced model never trips `budget_usd`.
  - Two questions are still open: a ceiling for the whole flow (Flow Design #12), and whether every step must have a budget and a turn cap (#37).
  - As built in run-flow (2026-10-23), a stopped run keeps what it spent so far: OpenCode's running dollars, or `cost unknown` for a Claude run stopped before its result, which has tokens but no price yet. An OpenCode model with no price is said aloud when its run ends: `-- <step>: no price for <model>: its cost shows as $0, and limits.budget_usd cannot stop it`. The run-flow plan settled #37: caps are optional, and `--check` warns about an agent step with neither when the flow has no ceiling. The ceiling for the whole flow (#12) is built (Alex's call): a required top-level `budget_usd`, 0 for none, which `--budget-usd` overrides for a run or a resume. Each agent run may spend only what is left, and once the runs' recorded costs reach the ceiling, run-flow stops the live runs and pauses (exit 3) until it is resumed with a larger one (Claude's calls, open to Alex's review). What remains: runs launched together may each spend all that is left; an OpenCode model with no price, and a run whose cost is unknown, add $0 to what is spent; and `--max-runs` has no default limit.
- **A second orchestrator runs inside each step.** Claude Code and OpenCode can start their own subagents.
  - Claude's `usage` leaves out subagent tokens; only `modelUsage` includes them ([[Provider SDK Fit Analysis]]).
  - OpenCode's subagents are capped by `max_turns` only since decision O15.
- **Hand-offs are untrusted.** One agent's artifact is the next agent's input, so the parking-lot idea of scanning for prompt injection applies to every edge.
- **A terminal waits for days.** A gate can stay open a long time, so `run-flow` needs `--resume` from its state file from the start.

## 10. Worth borrowing from yamlgraph

- **A linter you run before spending money** (`run-flow --check`), with rules for unguarded cycles, unreachable steps and unsatisfied inputs.
- **A diagram export**, with an overlay of the route a run actually took.
- **A content hash** over the flow and every prompt file it uses, recorded on each run. It ties every run to exact bytes, and it doubles as the version id if flows live in files.
- **Loop limits that fail at load time** when they can't apply, instead of doing nothing silently.
- **Pauses in two stages.** Store what the person is asked first, then pause. A resume then never rebuilds the question differently.
- **A completeness contract for dynamic fan-out**, for when it arrives:
  - every item is accounted for;
  - per-item failures are typed;
  - a minimum number of items must succeed.
- **Template variables checked before any run starts.**

As built in run-flow (2026-10-23):
- `--mermaid` prints the graph; the overlay of a run's route is left out.
- There is no content hash. `flow.json` pins each run's loaded flow, prompt text included. Now that a flow file is a recipe with no `folder` or `task` (Alex's call), a hash of it and its prompt files would identify a flow version; it is still not recorded, because nothing reads it yet: the flow library and the Monitor would (Claude's call, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).
- Loop limits fail at load time: `max_attempts` on a step that no rework route leads back to is an error, `steps.<name>.max_attempts: no rework route leads back to <name>, so nothing reads it`.
- Placeholders are not filled in yet, and `--check` warns about a `{{…}}` in a prompt file, or in the task when it is given `--task`: `--task: {{…}} is not filled in; the agent reads it as written`.

## 11. Suggested order of work

1. Settle the rules in section 8.
2. Add flow types and the validator to `core`, then `run-flow --check` and `--mermaid`.
3. Write the engine function, with table tests and Replay runs.
4. Add `set_outcome`, shell steps with fingerprints, and `requires` and `produces` paths in the prompt.
5. Build `run-flow`: one step at a time first, then fan-out under a cap, with a state file and `--resume`.
6. Run one real flow end to end on both providers.
7. Build the worker, queue and web app on the same engine.

## Sources

- **FlowBoard notes:** [[Execution Overview]], [[Execution Entities]], [[Execution Data Model]], [[Execution State Machines]], [[Run Outcomes]], [[Advancement Rules]], [[Fan-Out And Join]], [[Rework Loop]], [[Loop Guard And Escalation]], [[Stuck Detection And Fingerprints]], [[Infra Retries]], [[Runner Pipeline]], [[Agent Launch Contract]], [[Prompt Assembly]], [[Job Queue]], [[Worker Lifecycle]], [[Execution Runtime]], [[Shell Step Execution]], [[Execution Roadmap]], [[Execution Testing]], [[Flow Design Overview]], [[Flow Data Model]], [[Flow Definition Internals]], [[Step Kinds]], [[Step Definitions]], [[Connections And Routes]], [[Branching Joining And Loops]], [[Artifact Contract]], [[Check Steps]], [[Flow Validation]], [[Flows And Flow Versions]], [[Version Pinning]], [[Flow Storage]], [[Seeded Flows]], [[Flow Design Roadmap]], [[Ask Park And Resume]], and the feature map's §2, §4 and parking lot.
- **On `feature/agent-providers` only** (these links resolve once that branch merges): [[Run Config Reference]], [[Run Agent CLI Decisions]], [[Provider SDK Fit Analysis]], `docs/superpowers/specs/2026-10-18-yaml-run-config-design.md`, and the code in `code/flowboard/packages/` (`core`, `adapters`, `ask-user`, `cli`).
- **yamlgraph** `00742bd`:
  - `README.md` ("When NOT to Use", "Security Considerations"), `ARCHITECTURE.md`;
  - `yamlgraph/models/node_schema.py`, `yamlgraph/node_factory/copilot_runtime_claude.py`, `yamlgraph/routing.py`, `yamlgraph/compile/edge_compiler.py`;
  - `docs/investigations/fr1065-resumable-map.md`, `docs/node-type-census-2026-08.md`;
  - `scripts/judge.sh`, `examples/demos/reflexion/graph.yaml`;
  - repository statistics from the GitHub API on 2026-10-19.
- **LangGraph** [Graph API docs](https://docs.langchain.com/oss/javascript/langgraph/graph-api): graph steps (super-steps), the recursion limit, how nodes become active.
