---
tags: [flowboard, execution, internals, worker]
module: Execution
---

# Worker Lifecycle

The worker is the second Node process, `apps/worker`: *"job loop, runner, ask_user broker, escalation timer"* (PRD §3). The drawio *Harness architecture* page calls it *"Process 2 · apps/worker (Node) the harness proper; its rules come from packages/core"*.

## Starting

- `pnpm dev` starts both processes: *"`concurrently` to run `next dev` and the worker together under `npm run dev`"* (PRD §2). Acceptance: *"`pnpm dev` starts Next.js and the worker together"* (PRD §16).
- It opens the same SQLite file as the web process: *"WAL + `busy_timeout=5000` + `foreign_keys=ON`, opened via `VIBE_DB_PATH` so worker and MCP (foreign cwd) hit the same file."* (`02` §1; backlog 1.1 says the same)
- *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* (PRD §11.1)

> [!warning] Does the MCP process open the database?
> `02` §1 and backlog 1.1 have the MCP server open the same SQLite file. The PRD says it never does: *"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does"* (PRD §3), and the shim *"never opens the database and needs no network"* (PRD §9). The drawio *SQLite* card agrees with the PRD. Under the PRD's broker-and-shim design no MCP process opens the database. See [[Execution Open Questions]] #54.

## What it owns

| Responsibility | Source |
|---|---|
| Leasing jobs | PRD §7 |
| Running steps (the runner) | PRD §3 |
| The `ask_user` broker, *"the only writer of the `questions` table"* | PRD §9 |
| The escalation timer | PRD §3 |
| *"the only writer of run lifecycle state"* | `03` §7 |

`03` §7: *"the worker is a **generic executor host** — nothing about it knows the provider. This is the decoupling point that later allows remote executors or a fleet without touching the core."*

## Restart recovery

The first build lost runs here. Backlog intro: *"**Worker restart kills live runs.** Two real runs in the DB failed with "worker restarted while run was live". Runs in `starting` are never reclaimed at all."*

> *"**Restart recovery: re-attach by pid before failing.** A `starting`/`running` row whose pid is alive → keep tailing; dead → fail with a Retry hint. Pid-liveness is OS-generic."* (`03` §7)

Backlog 3.3 (**BUG**): *"Restart recovery: reclaim `starting` **and** `running`; prefer re‑attach by pid (still alive → keep tailing) over blanket fail; otherwise fail with a Retry hint. Two real runs died this way."*

```mermaid
flowchart TD
  S[Worker starts] --> F[find runs in starting or running]
  F --> P{pid alive?}
  P -->|yes| T[re-attach, keep tailing]
  P -->|no| L[lost on restart]
  L --> C{PRD §7: transient}
  C --> R[retry same attempt, wasted = 1]
```

> [!question] Fail with a hint, or retry?
> `03` §7 and backlog 3.3 say a dead pid → *"fail with a Retry hint"*. PRD §7 lists *"lost on restart"* as **transient**, retried automatically up to 3 times. See [[Execution Open Questions]].

> [!question] How to keep tailing
> The worker read the agent's stdout through a pipe. After a restart that pipe is gone. No source says how a re-attached worker reads the rest of the stream (for example, the CLI writing to a file under `data/runs/<id>/`). *Inferred gap*, listed in [[Execution Open Questions]]. For sandboxed runs, `docker logs -f` on the run's container would serve; not stated either.

## Shutting down

*"Graceful shutdown: SIGTERM children, mark runs `cancelled`, not `failed`."* (`03` §7; backlog 3.3 **GAP**). See [[Stopping And Cancelling]].

## Other fixes recorded against the worker

- *"Session‑id capture: parse once from the `system/init` event, not every line."* (backlog 3.3, **BUG (perf)**)
- *"Per‑run `mcp.json` pointing at `mcp/ask-user.ts` via `tsx --tsconfig <root>/tsconfig.json` (path aliases break when spawned from the worktree cwd)."* (backlog 3.2, **FIX**). The PRD's layout has `apps/mcp-shim` instead, a stdio server that forwards to the worker's broker and never opens the database (PRD §3, §9).
- Backlog intro, item 6: *"agents killed port 3000 (moved to 3111)."*

## Related

- [[Execution Index]]
- [[Job Queue]]
- [[Runner Pipeline]]
- [[Execution Runtime]]
- [[Stopping And Cancelling]]
