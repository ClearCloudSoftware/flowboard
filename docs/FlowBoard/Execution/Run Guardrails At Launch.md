---
tags: [flowboard, execution, concept, guardrails, sandbox]
module: Execution
---

# Run Guardrails At Launch

The checks the runner applies **before and while** it launches a run. The step's own guardrail fields are designed in [[Step Guardrails]]; the sandbox itself is documented in [[Sandboxing Index]] (see [[Permission Gate]], [[In-Agent Hooks]] and [[Resource Limits]]). This note covers what the runner enforces.

## Two gates

*"The sandbox limits what *can* happen; the hooks block what *shouldn't*."* (`03` §6; PRD §7 says the same.) The drawio harness concept 5, **Dual encoding**: *"The prompt says "stay in scope, ask through ask_user"; two gates enforce it: hooks inside the agent … and the box outside"*.

### The permission gate (outside)

| Rule | Source wording |
|---|---|
| No bypass on the host | *"It **refuses `bypassPermissions` unless the tier is a sandbox** (container/microVM), downgrading to an approval/auto mode on the `host` tier"* (`03` §6) |
| Why | *"**Egress restriction is the load-bearing control:** it holds even though `bypassPermissions` is on, because it is enforced below the agent's reasoning."* (PRD §11.1) |
| Default mode | `step_defs.permission_mode` defaults to `'bypassPermissions'` (PRD §5) |
| Non-root | `nonRoot?: boolean; // default true; bypassPermissions requires it` (`01-ports.md`, `SandboxProfile`) |
| Default tier | *"**Default tier = `container`** whenever a step's `permission_mode` is `bypassPermissions`"* (`08`, *Recommendation*; a recommendation, not a PRD rule) |
| No Docker | *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* (PRD §11.1). `08`'s recommendation adds *"(or warn)"*. |
| Git plugins on the host | *"On the host tier, a step that mounts a git-installed plugin does not run: that plugin's hooks and MCP servers would execute as me, with no egress wall. Seed plugins still run there."* (PRD §11.1) |
| Recorded | *"`runs.sandbox` records the tier that actually ran"* (PRD §11.1) |

The drawio *Permission gate* card: *"bypassPermissions only when the tier is container / gVisor / microVM; host tier → approval mode · budget caps map to --memory / --cpus / --pids-limit"*.

> [!warning] Refuse, downgrade or fail?
> The sources split on what happens to a bypass step on the host tier:
>
> | Response | Source |
> |---|---|
> | Refuse / reject | PRD §7 (*"`bypassPermissions` is rejected unless the tier is a sandbox"*); `01-ports.md` (*"the runner refuses"*) |
> | Refuse, or downgrade | PRD §11.1 (*"refuse it (or downgrade to an approval mode)"*) |
> | Downgrade | `03` §6 (*"downgrading to an approval/auto mode on the `host` tier"*); drawio (*"host tier → approval mode"*) |
> | Downgrade, or fail the step | `08` (*"or fails the step with a readable reason. A correctness rule, not a suggestion."*); backlog 3.5 (*"downgrade to an approval/auto mode or fail with a readable reason"*, tagged **NEW/DEC**) |
>
> Which tiers count also differs: `03` §6 names only *"(container/microVM)"*; `01-ports.md`, `08` and the drawio include gVisor.
>
> See [[Execution Open Questions]] #53, [[Sandboxing Open Questions]] #1 and #2.

> [!check] Answered by run-flow, 2026-10-23
> On the host, the only tier built, it refuses: `bypassPermissions`, `auto` or an allow entry that lets the agent run any shell command is an error unless the step sets `permissions.allow_unrestricted_shell: true` ([[Run Agent CLI Decisions]] R3). With that opt-in the step runs on the host, and `--check` and the flow's start print `-- warning: steps.<step>: unrestricted shell: commands can write outside <folder>` (`outside the folder` when `--check` is given no `--folder`); `permissions.mode` defaults to `acceptEdits` (R8), not `bypassPermissions`. The worker, once it has sandbox tiers, may still choose differently. See [[Run Flow Reference]].

### The hooks (inside)

The per-run `settings.json` registers `PreToolUse` hooks that deny (PRD §7):

- *"writes outside the task's worktree;"*
- *"any path matching a line of the task's `non_goals` that is written as a path or glob;"*
- *"destructive commands: `rm -rf` outside the worktree, any `git push`, `git reset --hard` or `git checkout` of the base branch, and piping a download into a shell."*

*"A denial returns its reason to the agent, so it changes course instead of stalling. The prompt states the same rules; the hook enforces them. Hooks are a provider capability (`tool_hooks`): a provider without them relies on the sandbox alone, and the flow editor says so."* (PRD §7) More in [[In-Agent Hooks]].

> [!warning] The shipped code differs
> No `settings.json` is written (2026-10-18). The rules travel in `RunSpec.guards`, and both adapters enforce them in-agent: Claude through an in-process `PreToolUse` hook callback, registered only when `guards` is set; OpenCode through a guard plugin. They deny file-edit writes outside the write roots or matching a `denyPaths` glob, a recursive `rm` outside the roots, and any `denyCommands` regex. `DEFAULT_DENY_COMMANDS` covers `git push`, `git reset --hard` and a download piped into a shell; the base-branch `git checkout` needs the branch name, so it is left to the runner, which is not built. See [[Run Spec]].

As built in run-flow (2026-10-23), an agent step's guards are `run-agent`'s, with three additions:

- **Write roots.** They are the folder the run names with `--folder`, or the step's `write_roots`, plus the run's artifacts folder; `write_roots: []` leaves only the artifacts folder. A flow file is a recipe that runs in many folders, so `write_roots` are paths inside the folder, relative to it: an absolute path, `~` or `..` is refused, `steps.<step>.write_roots.0: must be a path inside the folder, relative to it`. When the run folder lies inside the folder, it is a deny path.
- **Non-goal paths.** Nothing reads non-goals from the task file, which is free text. A step, or `defaults`, lists `guards.deny_paths` globs relative to the folder, and a matching edit is refused with `Path is a non-goal: <glob>`.
- **Commands that discard work.** `DISCARD_COMMANDS` (`cli/src/flow-run.ts`) refuses the git commands that throw away uncommitted edits, which in a flow are the earlier steps' work: `git checkout` with `--`, `.`, `-f` or `--force`; `git switch` with `--discard-changes`, `-f` or `--force`; `git restore`, except a staged-only `--staged`; `git clean`, except a dry run; and `git stash`, except `list` and `show`. `git checkout <path>` without `--` still gets through, since it looks like a branch switch. The base-branch `git checkout` rule still waits for the worker, which has a base branch (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).

Shell steps are not guarded: the hooks act inside an agent, and a check runs no agent.

## Tools

*"**Allowed tools** are the intersection of the agent's list and the skill's `allowed-tools` (whichever the step names), narrowed further by the step's own `allowed_tools` when set"* (PRD §7). *"When `--allowedTools` is set, always append `mcp__vibe__*` so a restrictive list cannot lock out `ask_user`."* (PRD §7)

> [!warning] The shipped code differs
> The injected server is named `flowboard`, so the agent sees `mcp__flowboard__ask_user` and `mcp__flowboard__ask_user_batch`. Each adapter pre-approves every injected server, with or without an allow list (`mcp__flowboard__*` on Claude, `flowboard_*` on OpenCode), and an explicit deny still wins (2026-10-22; [[Agent Providers Open Questions]] #31).

## Plugins

*"Use `--plugin-dir`, not `--add-dir`: only `--plugin-dir` registers a plugin's skills"*. *"Mount only the plugins the step names, never every installed one"*. *"Each plugin dir is the commit recorded in the task's `capability_pins`"* (PRD §7). Details in [[Capability Runtime Mounting]]. A skill that needs the network also needs its host on the step's egress allowlist; the capability library guide warns the library *"cannot do it for you: add the advisory host to that step's egress allowlist, or the first run fails closed."*

As built in run-flow (2026-10-23), a step mounts only the `plugins:` and `skills:` it names, and nothing is pinned: plugin folders are mounted as they stand, and skill folders are copied afresh at every launch, `--resume` included. Pinning waits for the capability library's pins (Claude's call, 2026-10-23, open to Alex's review).

## Limits

| Logical caps (the CLI) | Physical backstop (the sandbox), for both caps together |
|---|---|
| `max_turns` → `--max-turns`; `max_budget_usd` → `--max-budget-usd` | `--memory`, `--cpus`, `--pids-limit`, wall-clock |

PRD §11.1: resource limits *"physically backstop the logical `max_turns`/`max_budget_usd` caps"*. `03` §6: the runner *"maps the logical `max_turns` / `max_budget_usd` caps to the sandbox's physical `--memory` / `--cpus` / `--pids-limit` / wall-clock backstops"* (`03` §6). Backlog 3.5: *"a limit/timeout hit marks the run failed with reason."* PRD §7 classes *"budget or turn cap hit"* as non-transient: the task goes to `blocked`. No source gives the limit values or the mapping, or says how a physical limit hit is classified ([[Sandboxing Open Questions]] #12, #15). See [[Infra Retries]] and [[Resource Limits]].

As built in run-flow (2026-10-23), there is no sandbox backstop. A step's `limits.max_turns` and `limits.budget_usd` go to the provider. The flow file also sets `budget_usd`, the most the whole flow may spend, `0` for none, which `--budget-usd` overrides for a run or a `--resume` (Alex's call, 2026-10-23). Each agent run may spend only what is left of it: its `limits.maxBudgetUsd` is the step's `limits.budget_usd` or what is left, whichever is lower. When a run ends and the flow has spent its budget, run-flow stops the live runs and pauses, with exit 3 (the per-run cap and the pause are Claude's calls, 2026-10-23, open to Alex's review). When the flow has no budget (`0`, from the flow file or `--budget-usd`), `--check` and the start warn about an agent step with neither limit: `steps.<step>: no limits.max_turns or limits.budget_usd, and the flow has no budget; nothing stops a looping agent`. `timeout_minutes` adds a wall clock per step: 30 minutes by default for a shell step, none for an agent step. The clock stops while one of the run's questions waits for a person (Claude's call, 2026-10-23, open to Alex's review). A limit hit or a timeout ends the run with an error, and the step waits at a *run failed* gate; nothing retries it by itself. An OpenCode model with no price cannot be stopped by its budget, and the run says so: `-- <step>: no price for <model>: its cost shows as $0, and limits.budget_usd cannot stop it`.

## Isolation from the operator's own config

Backlog D5: *"Hook isolation for headless runs"*, default *"Empty `--settings` file per run"*. The intro lists the leak that prompted it: *"global `~/.claude` hooks apply to headless runs"*. Backlog 0.1 leaves the method open (**DEC**): *"Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`)."* The probe shows the leak: `docs/old/stream-sample.jsonl` opens with five personal `SessionStart` hooks firing before `system/init`. `--strict-mcp-config` does the same job for MCP (PRD §7).

> [!warning] Empty, or holding the hooks?
> D5's *"Empty `--settings` file per run"* (also the drawio card *"D5 · Hook isolation / Empty --settings file per headless run"*) cannot be squared with PRD §7's *"`--settings <generated per-run settings.json with PreToolUse hooks>`"* and the drawio *Runner* card's *"writes per-run mcp.json + settings.json (hooks)"*. D5's aim, keeping the operator's global `~/.claude` hooks out, still holds; its "empty" predates the hooks gate. See [[Execution Open Questions]] #52, [[Agent Providers Open Questions]] #24 and [[Sandboxing Open Questions]] #24.

> [!warning] The shipped code differs
> On the host tier the code uses neither a `--settings` file nor `CLAUDE_CONFIG_DIR` (2026-10-18). Claude runs get `settingSources: []`, which loads no user, project or local settings and skips the folder's `CLAUDE.md`, plus `strictMcpConfig`; the guards are an in-process hook, so no settings file is needed. OpenCode runs get a fresh `XDG_CONFIG_HOME` and `OPENCODE_DISABLE_PROJECT_CONFIG=1` ([[Agent Providers Open Questions]] #24).

## No real credential

*"No real credential is passed in: the CLI's `ANTHROPIC_BASE_URL` points at the egress proxy, which injects it."* (`03` §6) PRD §11.1 adds the dummy key: *"The CLI gets `ANTHROPIC_BASE_URL` pointing at the egress proxy and a dummy key."* See [[Credential Injecting Proxy]].

> [!warning] The shipped code differs
> No proxy is built: runs are host child processes in the real folder with the owner's credentials. Claude uses the installed CLI's subscription login, and the adapter strips `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`; OpenCode uses its own stored credentials. A dummy key behind a proxy fits an API key, not that login ([[Claude Code Adapter]]). As of 2026-10-18.

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Runner Pipeline]]
- [[Step Guardrails]]
- [[Capability Tools And Egress]]
- [[Permission Gate]]
- [[In-Agent Hooks]]
