---
tags: [flowboard, execution, concept, guardrails, sandbox]
module: Execution
---

# Run Guardrails At Launch

The checks the runner applies **before and while** it launches a run. The step's own guardrail fields are designed in [[Step Guardrails]]; the sandbox itself belongs to the Sandboxing platform component (not yet documented). This note covers what the runner enforces.

## Two gates

*"The sandbox limits what *can* happen; the hooks block what *shouldn't*."* (`03` §6; PRD §7 says the same.) The drawio harness concept 5, **Dual encoding**: *"The prompt says "stay in scope, ask through ask_user"; two gates enforce it: hooks inside the agent … and the box outside"*.

### The permission gate (outside)

| Rule | Source wording |
|---|---|
| No bypass on the host | *"It **refuses `bypassPermissions` unless the tier is a sandbox** (container/microVM), downgrading to an approval/auto mode on the `host` tier"* (`03` §6) |
| Why | *"**Egress restriction is the load-bearing control:** it holds even though `bypassPermissions` is on, because it is enforced below the agent's reasoning."* (PRD §11.1) |
| Default mode | `step_defs.permission_mode` defaults to `'bypassPermissions'` (PRD §5) |
| No Docker | *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* (PRD §11.1) |
| Git plugins on the host | *"On the host tier, a step that mounts a git-installed plugin does not run: that plugin's hooks and MCP servers would execute as me, with no egress wall. Seed plugins still run there."* (PRD §11.1) |
| Recorded | *"`runs.sandbox` records the tier that actually ran"* (PRD §11.1) |

The drawio *Permission gate* card: *"bypassPermissions only when the tier is container / gVisor / microVM; host tier → approval mode · budget caps map to --memory / --cpus / --pids-limit"*. `08` adds a second option: *"On `host` tier it downgrades to an approval/auto mode, or fails the step with a readable reason. A correctness rule, not a suggestion."*

### The hooks (inside)

The per-run `settings.json` registers `PreToolUse` hooks that deny (PRD §7):

- *"writes outside the task's worktree;"*
- *"any path matching a line of the task's `non_goals` that is written as a path or glob;"*
- *"destructive commands: `rm -rf` outside the worktree, any `git push`, `git reset --hard` or `git checkout` of the base branch, and piping a download into a shell."*

*"A denial returns its reason to the agent, so it changes course instead of stalling."* (PRD §7)

## Tools

*"**Allowed tools** are the intersection of the agent's list and the skill's `allowed-tools` (whichever the step names), narrowed further by the step's own `allowed_tools` when set"* (PRD §7). *"When `--allowedTools` is set, always append `mcp__vibe__*` so a restrictive list cannot lock out `ask_user`."* (PRD §7)

## Plugins

*"Use `--plugin-dir`, not `--add-dir`: only `--plugin-dir` registers a plugin's skills"*. *"Mount only the plugins the step names, never every installed one"*. *"Each plugin dir is the commit recorded in the task's `capability_pins`"* (PRD §7). Details in [[Capability Runtime Mounting]].

## Limits

| Limit | Logical | Physical backstop |
|---|---|---|
| Turns | `max_turns` → `--max-turns` | wall-clock |
| Spend | `max_budget_usd` → `--max-budget-usd` | `--memory`, `--cpus`, `--pids-limit` |

*"maps the logical `max_turns` / `max_budget_usd` caps to the sandbox's physical `--memory` / `--cpus` / `--pids-limit` / wall-clock backstops"* (`03` §6). Backlog 3.5: *"a limit/timeout hit marks the run failed with reason."* PRD §7 classes *"budget or turn cap hit"* as non-transient: the task goes to `blocked`. See [[Infra Retries]].

## Isolation from the operator's own config

Backlog D5: *"Hook isolation for headless runs"*, default *"Empty `--settings` file per run"*. The intro lists the leak that prompted it: *"global `~/.claude` hooks apply to headless runs"*. `--strict-mcp-config` does the same for MCP (PRD §7).

## No real credential

*"No real credential is passed in: the CLI's `ANTHROPIC_BASE_URL` points at the egress proxy, which injects it."* (`03` §6)

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Runner Pipeline]]
- [[Step Guardrails]]
- [[Capability Tools And Egress]]
