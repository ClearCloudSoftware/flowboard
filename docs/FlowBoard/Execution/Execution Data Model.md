---
tags: [flowboard, execution, data-model, schema]
module: Execution
---

# Execution Data Model

The tables and columns execution reads and writes. Schema is PRD §5 (*"Write this as Drizzle schema"*) unless noted. Columns added by other sources are marked.

## Read: the pinned flow

| Table | Columns execution uses |
|---|---|
| `step_defs` | `kind` (*"'ai' \| 'shell' \| 'manual'"*), `command` (*"null = the project's check_command"*), `skill_id`, `agent_id`, `extra_plugin_ids`, `prompt_template`, `model` (default `'sonnet'`), `effort` (default `'medium'`), `permission_mode` (default `'bypassPermissions'`), `allowed_tools`, `max_turns`, `max_budget_usd`, `max_attempts` (default 3), `advance_mode` (`auto` \| `approval`), `requires`, `produces`, `is_entry` |
| `step_edges` | `from_step`, `to_step`, `condition` (`always` \| `on_pass` \| `on_fail`) |
| `projects` | `repo_path`, `check_command`; `default_flow_id`, which is presumably the version a task pins (*inference*: no source says which flow promotion pins; see [[Project Default Flow]]) |
| `tasks` | `title`, `body`, `acceptance_criteria`, `non_goals` (prompt preamble, template placeholders, and the non-goal path hooks, PRD §7); `worktree_path` (`cwd`); `capability_pins` (*"Each plugin dir is the commit recorded in the task's `capability_pins`"*, PRD §7) |
| `agents` | `system_prompt` (`--append-system-prompt`), `allowed_tools` (the tool intersection), `default_model` (*"a Claude alias, used as the logical model id"*, PRD §5), `default_effort`; *"agent rows are pinned the same way"* as plugin dirs (PRD §7) |
| `skills` | `slug` (the `/<plugin>:<slug>` invocation), `allowed_tools` (PRD §7) |
| `plugins` | `name`, `commit_sha` (the plugin dir), `source` (a git-installed plugin does not run on the host tier, PRD §11.1) |
| `settings` | A key/value table (`key`, `value`, PRD §5). Keys: draft mode (PRD §13), escalation threshold (minutes in `06` §15 and backlog 8.3; `settings.escalation_threshold_ms`, default 5 min, in `04` §10 and backlog 6.1; sets the `escalate_question` `run_after`), `sandbox_profile` (PRD §11.1), `memory` block (PRD §11.2). See [[Settings Data Model]]. |

Backlog 1.1 (**NEW**) adds an optional `step_defs.sandbox_profile` override, not in PRD §5's SQL ([[Sandboxing Data Model]]).

As built in run-flow (2026-10-23), there is no database. The pinned flow is the run folder's `flow.json`, `{ version: 1, config, artifactsDir, maxRuns }`, with `maxRuns: null` for no cap. A flow file is a reusable recipe (Alex's call, 2026-10-23), so `config` also pins what the run gave it: `folder`, from `--folder`, and `budgetUsd`, the flow's budget (`0` for none), which a `--budget-usd` given at `--resume` replaces. Its `config.flow` is what the engine reads:

- each `StepDef` holds `id`, `requires`, `produces`, `approval` (the step's `gate: approval`, for `advance_mode`) and `maxAttempts` (default 3);
- the edges are `{ from, to, condition }`, as in `step_edges`;
- `entry` holds the step a top-level `entry:` names. `is_entry` is not stored: `entries()` in `core/src/flow/flow.ts` derives it.

The rest of a step's columns are in `config.steps`, the host's: `kind` as `ai` or `shell`, a shell step's `command` and `timeoutMinutes`, and an agent step's `run`, its `adapter` and the `RunSpec` that `run-agent` builds from its keys (`model`, `effort`, `permissionMode`, which defaults to `acceptEdits`, the system prompt, plugins and skills, guards and limits). There are no `projects`, `tasks`, `agents`, `skills` or `plugins` rows: the task is one free-text file, named by each run's `--task`, the same preamble for every agent step, and non-goal paths are a step's `guards.deny_paths`.

## Written: task and instance state

| Table | Column | Values / meaning |
|---|---|---|
| `tasks` | `status` | `backlog`, `todo`, `running`, `blocked`, `done`, `failed`, `cancelled` |
| | `flow_id` | *"null while in backlog, pinned on promotion"* |
| | `branch_name`, `worktree_path` | set on promotion |
| | `capability_pins` | *"set when the task starts"* |
| `step_instances` | `state` | `pending`, `running`, `awaiting_answers`, `awaiting_approval`, `done`, `failed`, `skipped` |
| | `attempts` | counted runs; the rework budget |
| | `outcome` | `pass`, `fail`, null |
| | `reason` | *"rejection/failure text shown on the card"* (backlog 1.1, `02` §1; not in PRD §5) |

As built in run-flow (2026-10-23), this state is the run folder's `state.json`, the engine's `FlowState`, written whole after every transition:

- `status` is `running`, `done` or `failed`. No status is stored for a paused or stopped flow; both can be read from the file. Paused is a step at a gate with no run live; stopped is a step `running` with no run live (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). A flow paused because its budget is spent can read like a stopped one; its spend, against `flow.json`'s `config.budgetUsd`, tells them apart.
- `steps` holds one `StepInstance` per step. Its `state` is `pending`, `running`, `awaiting_approval`, `done` or `failed`. There is no `awaiting_answers`, since a question is answered while its run waits, and no `skipped`, since a rework drops the steps below its target instead.
- A `StepInstance` also keeps `attempts`, `outcome`, `inputs`, `note` (what its current attempt was started with) and `gate`. The gate holds `kind` (`verdict`, `escalation` or `run_failed`), `reason`, `evidence` and `decisions`, and on an escalation `from` and a Reject's `note`.

## Written: questions

The worker's broker is *"the only writer of the `questions` table"* (PRD §9); see [[Human In The Loop Data Model]]. Execution touches it in one place: on a run failure, *"cancel that step's pending questions"* (backlog 3.2, `04` §9).

As built in run-flow (2026-10-23), there is no `questions` table. Each agent run's log records its questions as `question`, `answer` and `withdrawn` lines, each with a `batch` number, and its broker withdraws any question still open when the run ends.

## Written: runs and events

| Table | Column | Meaning |
|---|---|---|
| `runs` | `attempt` | the attempt this run belongs to |
| | `claude_session_id` | `--session-id`, and `--resume` on a resume (PRD §7, §9). As built, no adapter passes a session id: the provider reports it, read from `AgentRun.sessionId` ([[Agent Providers Open Questions]] #5). `02` §1 proposes renaming it `agent_session_id`; PRD §5 keeps the old name |
| | `pid` | for Stop and restart re-attach |
| | `state` | `starting`, `running`, `parked`, `succeeded`, `failed`, `cancelled` |
| | `exit_code`, `error` | process result; `error` holds stderr (PRD §7), *"stderr tail"* (backlog 3.2) |
| | `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `num_turns` | usage |
| | `wasted` | *"1 if superseded by a rework loop or an infra retry"* |
| | `fingerprint` | *"shell steps: normalized hash of a failing check_output"* |
| | `started_at`, `ended_at` | timing |
| | `model`, `effort` | actual values after draft mode (backlog 1.1, `02` §1; named in PRD §11.1's prose, not in PRD §5's SQL) |
| | `provider` | proposed by `02` §1; not in PRD §5 ([[Agent Providers Data Model]]) |
| | `sandbox` | *"tier that ran, for audit"* (backlog 1.1); *"records the tier that actually ran"* (PRD §11.1's prose, not PRD §5's SQL) |
| `run_events` | `run_id`, `seq`, `v`, `type`, `raw`, `summary`, `created_at` | index `run_events_run_seq` |
| `artifacts` | `task_id`, `step_instance_id`, `type`, `path`, `bytes` | registered after a run |
| `run_memories` | `run_id`, `memory_id`, `scope` | optional, audit of recall (PRD §11.2; not in PRD §5). See [[Memory Data Model]] |

As built in run-flow (2026-10-23), a run is a `RunRecord` in `state.json`'s `runs`:

- `id`, `step`, `attempt`, `live`, `wasted`, `outcome`, `reason` (the agent's `set_outcome` reason) and `fingerprint`;
- `queued: true` from the engine's run command until the host reports the launch;
- `costUsd`, which is `null` when the provider reported no price, as for a Claude run stopped before its result;
- `error` in place of `state`: the provider's error, `stopped` (by *Fail the flow*), `interrupted` (cut off by Ctrl+C, a crash or a spent budget), `not launched`, `superseded` (stopped by a rework or an escalation), `timed out after <n> minutes`, or a shell step's setup failure;
- `missing`, the outputs the run did not write.

The other columns are in the run's log, `<NNN>-<step>.jsonl`, every line of which has an `at` time. The `start` line holds the launched `RunSpec`, `model` and `effort` included; the `pid` line holds the agent CLI's pid (on OpenCode, its server's) or the check's process group (`"group":true`), with the process's start time (`started`), so that a later run-flow stops only that process; the `system` event holds the session id; the `result` line holds the exit code, the usage with its tokens and turns, and the error. The adapter is the step's, in `flow.json`. The event lines stand in for `run_events`, with no `seq` or `v`, and `flow.jsonl` records each transition of the engine. Artifacts are files, `<folder>/.flowboard/<run folder name>/<type>.md`, and are not registered. There is no `sandbox`: every run is on the host. The `queued` flag, and which columns go to `state.json` and which to the log, are Claude's calls (2026-10-23, open to Alex's review).

## Written: the queue

`jobs`: `kind`, `payload`, `run_after`, `state`, `attempts`, `last_error`, `leased_at`, `created_at`. See [[Job Queue]]. As built in run-flow (2026-10-23), there is no `jobs` table: the host keeps the engine's run commands in memory, and a run waiting for a slot is `queued`.

## Entity relationships

```mermaid
erDiagram
  tasks ||--o{ step_instances : has
  step_defs ||--o{ step_instances : "instantiated as"
  step_instances ||--o{ runs : "attempted by"
  runs ||--o{ run_events : emits
  step_instances ||--o{ artifacts : produces
  tasks ||--o{ artifacts : owns
  flows ||--o{ step_defs : contains
  flows ||--o{ step_edges : contains
  tasks }o--|| flows : pins
```

`jobs` has no foreign keys. Its `payload` is unspecified `TEXT`; that it carries the ids is an *inference* ([[Execution Open Questions]] #34).

## `runs` as a journal

`02` §1: *"treat `runs` as an **append-only usage journal** — never mutate cost after the result lands; corrections are new rows."* The `wasted` flag is set after the fact on superseded runs, which is a mutation; whether it counts as a correction is not stated ([[Execution Open Questions]] #46). As built in run-flow (2026-10-23), `state.json` is rewritten whole after every transition, so `wasted`, and a stopped run's cost reported late, change the run's own record; `flow.jsonl` is the append-only account of what happened.

## Missing columns

| Need | Why | Status |
|---|---|---|
| Task paused | Task-detail **Pause** | *proposal*: a status or a flag ([[Task Data Model]] proposes a `paused` status; [[Execution Open Questions]] #29). In run-flow, none is stored: a step at a gate with no run live reads as paused |
| Run stop reason | Monitor: *"stopped by you"* | *proposal*: reuse `runs.error` (every shipped provider's `stop()` already sets `error: 'stopped'` on a run stopped before its result). In run-flow, `RunRecord.error`: `stopped` (by *Fail the flow*), `interrupted`, `not launched`, `superseded` or `timed out after <n> minutes` |
| Escalation kind on a gate | spent, stuck, no outcome, approval | *proposal*: reuse `step_instances.reason`. In run-flow, the instance's `gate.kind` (`verdict`, `escalation`, `run_failed`) and `gate.reason` (`impl has used 3 of 3 attempts`, `check failed the same way twice`, `no outcome reported`, `approval needed`, …) |
| Retry note | PRD §8 *"carries my note into it"* | not stated where it is stored ([[Execution Open Questions]] #21). In run-flow, `StepInstance.note`, the note the current attempt started with; an escalation gate keeps a Reject's note as `gate.note` for its Retry |

## Related

- [[Execution Index]]
- [[Execution Entities]]
- [[Execution State Machines]]
- [[Task Data Model]]
- [[Flow Data Model]]
- [[Agent Providers Data Model]]
- [[Sandboxing Data Model]]
- [[Domain Schema]]
