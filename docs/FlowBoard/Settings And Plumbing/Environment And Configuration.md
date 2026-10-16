---
tags: [flowboard, settings-and-plumbing, plumbing, configuration]
module: Settings And Plumbing
---

# Environment And Configuration

Configuration that lives outside the `settings` table: environment variables, `.env.local`, and fixed files. The split the sources imply (no source states it) is **secrets and install paths in the environment, user preferences in `settings`**.

## Environment variables

| Variable | Purpose | Source |
|---|---|---|
| `VIBE_ROOT` | not defined; the name suggests the install root | backlog 1.1 |
| `VIBE_DB_PATH` | the SQLite file; set so *"worker and MCP (spawned with a foreign cwd) open the same file"*; a throwaway path for tests | backlog 0.2, 1.1; `02` §1 |
| `VIBE_MAX_RUNS` | concurrency cap for the worker | backlog 3.1; `03` §7; drawio |
| `VIBE_ASK_TIMEOUT_MS` | overrides the 20-minute ask timeout, for tests | backlog 4.1 (**PRD/FIX**) |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` | Slack; *"lives in `.env.local`. If the token is absent, log the escalation and carry on — Slack is optional."* The signing secret assumes inbound HTTP; the drawio uses Socket Mode ([[Escalation And Notifications Open Questions]] #6) | PRD §10 |
| `ANTHROPIC_BASE_URL` | points the CLI at the egress proxy; the container holds *"a dummy key"* | PRD §0, §11.1 |
| `RUN_ID`, socket path | passed to the MCP shim per run | PRD §9 |
| `TASK_ID`, `STEP_INSTANCE_ID`, `RUN_ID` | the first build's MCP env | backlog 4.1 |

`SandboxProfile.env` is *"run-scoped; never a real credential (the proxy injects it), never baked into the image"* (`01-ports.md`). The reference file disagrees: *"Run-scoped env (model/CLI auth). Never bake secrets into the image."* (`exec-host.ts`). See [[Sandboxing Open Questions]] #26.

> [!warning] Where the real model credential lives
> PRD §11.1: *"The proxy swaps in the real credential, and only on requests to the model endpoint."* No source says where the proxy reads it from (an env var, `.env.local`, the OS keychain). The memory block's *"key ref"* has the same gap. See [[Settings And Plumbing Open Questions]] #24.

## Files and paths

| Path | What | Source |
|---|---|---|
| `.env.local` | Slack config | PRD §10 |
| `drizzle.config.ts` | drizzle-kit config | PRD §3 |
| `data/flowboard.db` | the database | PRD §3 |
| `data/runs/<id>/args.json` | snapshot of the final CLI args | PRD §7, backlog 3.2 |
| `data/runs/<id>/spec.json` + raw stream | run record, *"replayable at $0"* | drawio |
| `data/sock/<run_id>.sock` | broker socket per run | PRD §9 |
| `seed/flows/default.json`, `skills/` | seed content | PRD §3, §15 |
| `<repo>/.flowboard/skills/` | installed plugins, added to that repo's `.git/info/exclude` | backlog 0.3 |
| `.vibe-worktrees/`, `.vibe/task-<id>/` | worktrees and artifacts | PRD §6, §11 |

`.gitignore` (repo root, from backlog 0.3): `data/*.db*`, `data/runs/`, `.vibe-worktrees/`.

## CLI isolation

Headless runs must not pick up the user's own Claude config:

- *"Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`)."* — **DEC** (backlog 0.1); D5: *"Empty `--settings` file per run"*; drawio *FlowBoard ideation*: *"Empty --settings file per headless run"*.
- *"`--strict-mcp-config` is important: it stops my personal MCP config leaking into runs"* (PRD §7).

> [!warning] An empty `--settings` file, or the hooks file?
> PRD §7 passes `--settings <generated per-run settings.json with PreToolUse hooks>`, so the file cannot be empty. Whether that file alone keeps `~/.claude` hooks out is not stated. See [[Settings And Plumbing Open Questions]] #29.

The per-run `settings.json` here is Claude Code's settings file, not FlowBoard's `settings` table. See [[Settings And Plumbing Glossary]].

## Naming

Env vars, artifact folders, the worktree folder and the MCP namespace (`mcp__vibe__*`) all still use **vibe**, the first build's name. The drawio's worktree path is `<repo>/.flowboard/worktrees/task-<id>` on branch `fb/task-<id>`. See [[Settings And Plumbing Open Questions]] #19, [[Execution Open Questions]] #3 and [[Workspaces Open Questions]] #6.

## Related

- [[Settings Defaults]]
- [[Database And Connection]]
- [[Settings And Plumbing Storage]]
- [[Process Topology]]
