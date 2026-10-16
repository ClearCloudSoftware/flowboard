---
tags: [flowboard, projects, concept, check]
module: Projects
---

# Project Check Command

`projects.check_command TEXT`, *"e.g. 'pnpm lint && pnpm test'; what a shell check step runs"* (PRD §5). It is the project's answer to "does the code work?", and the default for every check step in every flow of the project.

## The fallback rule

> `command TEXT, -- kind='shell' only; null = the project's check_command` (PRD §5, `step_defs`)

| Step `command` | Project `check_command` | What runs |
|---|---|---|
| set | any | the step's `command` |
| null | set | the project's `check_command` |
| null | null | **not stated** — see [[Projects Open Questions]] #6 |

## How it runs

> *"A `kind='shell'` step runs no model. The runner executes `step.command` (or the project's `check_command`) in the task's worktree through the same execution host, so it inherits the sandbox. It writes stdout and stderr (tail, ~20 kB) to a `check_output` artifact. The **exit code is the outcome**: 0 sets `pass`, anything else sets `fail`."* (PRD §7)

| Property | Source wording |
|---|---|
| Sandboxed like an agent | *"through the same `ExecHost`, so it is sandboxed like any agent"* (`03` §6) |
| Its own container | drawio *Check container*: *"same image and mounts, no model, no API key: runs check_command and exits with its code"*; drawio *Shell executor*: *"runs check_command in a fresh sandbox"*. PRD §7 runs it *"in the task's worktree through the same execution host"*; which box it uses is [[Execution Open Questions]] #40 |
| A result, not a failure | *"A non-zero exit here is a result, not a run failure, so it follows the step's edges instead of blocking the task."* (PRD §7) |
| Free | *"Shell runs cost nothing and record `cost_usd = 0`."* (PRD §7) |
| Fingerprinted | `runs.fingerprint`: *"shell steps: normalized hash of a failing check_output (§8)"* (PRD §5); drawio: *"fingerprint → runs"* |
| The sensor | *"Shell steps are the sensors … The model proposes; the harness runs the check; the exit code decides."* (`03` §6) |

Execution detail lives in [[Shell Step Execution]] and [[Check Steps]].

## In the seeded flow

The `check` step, *Lint & test*, is `shell (project check_command)` (PRD §15). It is the join after the `implement`/`tests` fan-out, and runs before review: *"`check → review` on `on_pass` and `check → implement` on `on_fail` (the mechanical loop: the model never gets reviewed on code that doesn't pass)."* And: *"Seed the scratch project's `check_command` with something that exists in the scratch repo."* (PRD §15). See [[Seeded Project]].

## Where you set it

No source specifies a field for it. The feature map's create form is *"name it and choose which recipe"* (§1); backlog Story 1.3 adds only the flow-type select; settings (§19, PRD §13, backlog Story 8.3) list global switches only. See [[Projects Open Questions]] #6.

## Related

- [[Check Steps]]
- [[Shell Step Execution]]
- [[Project Record]]
- [[Seeded Project]]
- [[Stuck Detection And Fingerprints]]
