---
tags: [flowboard, execution, internals, runtime, architecture]
module: Execution
---

# Execution Runtime

Where execution's code and processes live.

## Processes

The drawio *Harness architecture* title: *"One laptop · two Node processes · one SQLite file · one throwaway Docker container per run."*

| Process | Role in execution | Source |
|---|---|---|
| `apps/web` (Next.js) | *"thin: validates, calls core, enqueues; never spawns agents"* | drawio |
| `apps/worker` (Node) | job loop, runner, `ask_user` broker, escalation timer (PRD §3); *"the harness proper; its rules come from packages/core"* (drawio) | PRD §3, drawio |
| `apps/mcp-shim` | *"tiny stdio MCP server; forwards to the broker over a unix socket"*; *"the CLI launches"* it, one per run (PRD §9) | PRD §3, §9 |
| Agent CLI | `claude -p …`, spawned through the ExecHost: a host child process, or inside the run's container | PRD §7, §11.1 |
| Sandbox container | non-host tiers only: *"one container per run, destroyed on exit"* | drawio *Docker Desktop* box; PRD §11.1 (*"one per run, destroyed on completion"*) |
| Egress proxy | the only way out of the sandbox network | PRD §11.1 |

> [!warning] The shipped code differs
> - The shim is `code/flowboard/packages/ask-user/`, not `apps/mcp-shim`. The agent CLI, or the OpenCode server, still launches it once per run. Its broker (`cli/src/ask/broker.ts`) runs inside the terminal commands, `pnpm run-agent` and, one per agent run, `pnpm run-flow`, not in a worker.
> - The agent is not started as `claude -p …`. The Claude Agent SDK spawns the installed `claude` through the host ExecHost and talks to it over stdio; OpenCode runs one `opencode serve` per run. Both are host child processes (2026-10-18). See [[Agent Providers Runtime]].

As built in run-flow (2026-10-23), one `pnpm run-flow` process stands in for `apps/worker` for one flow: it runs the engine, launches each step's run, and hosts the brokers. There is no web process, queue, database, container or egress proxy; a lock file keeps one such process per folder. See [[Run Flow Reference]].

```mermaid
flowchart LR
  subgraph host[Your machine]
    web[apps/web] -- enqueue --> db[(SQLite)]
    wk[apps/worker] -- lease / write --> db
    web -- SSE tail --> db
  end
  subgraph docker[Docker]
    box[run container] --> px[egress proxy]
  end
  wk -- docker run via ExecHost --> box
  box -- stream-json --> wk
  box -- ask.sock --> wk
  px --> api[model endpoint]
```

## Code layout

*"**`packages/core` imports no framework, no database driver and no CLI.** The engine, loop guard, advancement rules, prompt builder, fingerprinting and the port interfaces live there."* (PRD §3)

```
packages/
  core/
    engine/     # DAG traversal, advancement rules, loop guard (§8)
    prompt/     # the prompt parts (§7)
    ports/      # AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource
    events.ts   # NormalizedEvent, versioned (§7 "Events")
  db/           # Drizzle schema, migrations
  adapters/
    agent/      # claude-cli, codex-cli (later), replay
    exec/       # host, docker
apps/
  web/  worker/  mcp-shim/
```

(PRD §3, trimmed to the execution parts.) The architecture README's layout puts the runner and worker at top level: *"`runner/` # generic execution loop — imports ports, not adapters (03)"*, *"`worker/` # queue + lifecycle"*. Its rule: *"`core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule."*

> [!warning] The shipped code differs
> The provider layer, built 2026-10-18, lives in `code/flowboard/packages/`. `core/src/ports/` holds `agent-provider.ts`, `events.ts` and `exec-host.ts`, and `events.ts` has no version `v` yet ([[Agent Providers Open Questions]] #6). `adapters/src/agent/` holds `claude`, `opencode` and `replay`, and `adapters/src/exec/` only the `host` tier; the shim is `ask-user`, and `cli` is `run-agent`. OpenCode, not Codex, was built second; Codex is designed, not built ([[Agent Providers Open Questions]] #38).

As built in run-flow (2026-10-23), the engine is `core/src/flow/`: `engine.ts` (DAG traversal, advancement, the loop guard), `flow.ts` (the flow shape and its validation) and `fingerprint.ts`. `cli` also holds `run-flow`, the terminal host that stands in for the runner and the worker: `flow-config.ts` (the flow file), `flow-run.ts` (the command) and `flow-exec.ts` (one step's run).

## Ports execution touches

| Port | Used for | Source |
|---|---|---|
| AgentProvider | launch a run | `01-ports.md`; [[Agent Launch Contract]] |
| Workspace | `cwd`, `execHost(task)` | `workspace.ts` |
| ExecHost | where the process runs | `exec-host.ts` |
| ArtifactStore | scan and register outputs | `07` |
| MemoryStore | recall and commit (additive) | `01-ports.md`, `09` |

```ts
export interface ExecHost {
  readonly id: IsolationTier;          // 'host' | 'container' | 'gvisor' | 'microvm'
  readonly profile?: SandboxProfile;   // absent for the host tier
  spawn(command: string, args: string[], opts: { cwd: string; env?: Record<string, string> }): ChildHandle;
}
```

(The reference `docs/old/reference/core/ports/exec-host.ts`; the trailing comments are shortened from its doc comments.) *"This keeps sandboxing orthogonal to the provider: **any provider × any tier, for free** (2×N, not N×M)."* (`01-ports.md`)

> [!warning] The shipped code differs
> On 2026-10-18 the shipped port, `core/src/ports/exec-host.ts`, replaced the reference. `ChildHandle` is gone. The shipped method is `spawn(command: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): ChildProcessWithoutNullStreams`: it returns Node's own child process with piped stdio, because providers need stdin (the Claude Agent SDK speaks to the CLI over stdio). `id`, `profile`, `IsolationTier` and `SandboxProfile` are unchanged. Only the `host` tier is built (`adapters/src/exec/host.ts`). See [[ExecHost Port]].

As built in run-flow (2026-10-23), agent steps reach `ExecHost` through the adapters, which use the host tier because `RunSpec.exec` is never set. Shell steps bypass it: `execShell` calls Node's `spawn('sh', ['-c', …], { detached: true })` directly, so stopping a check can kill its whole process group, which `ExecHost` cannot do yet. A `ponytail:` comment in `cli/src/flow-exec.ts` marks the way back; the sandbox tier must route shell steps through `ExecHost` again, with a group kill.

## The test of the abstraction

*"Adding **Codex** should require only: … Zero changes to: engine, board projection, HITL protocol, notifier, cost rollups, viewer, API. If step 4 isn't true, the abstraction leaked"* (`06`, *Where a new provider actually touches the codebase*).

## A wider engine

`02` §3 and the architecture README's open decision 1: generalise `kind` into a `StepExecutor` interface.

```ts
interface StepExecutor {
  kind: 'agent' | 'skill' | 'shell' | 'http' | 'transform' | 'manual';
  run(step: StepDef, ctx: RunContext): Promise<RunResult>;  // RunResult identical across executors
}
```

*"Nearly free given the DAG already exists; widens the engine's core interface, so decide before hardening."* (`02` §3) The drawio *FlowBoard ideation* card: *"StepExecutor generalization / A step could be shell, HTTP, pure transform or a human task, not only an agent."*

As built in run-flow (2026-10-23), the engine knows no kinds. Its `StepDef` holds `id`, `requires`, `produces`, `approval` and `maxAttempts`; whether a step is an agent step or a shell step lives in the host's `FlowConfig`, and the engine sees only each run's `RunEnd`. The step rules stay in the CLI loader until a second reader, the canvas or the worker, exists; moving them means adding `kind` to `StepDef` (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).

## Related

- [[Execution Index]]
- [[Life Of One Step]]
- [[Runner Pipeline]]
- [[Worker Lifecycle]]
- [[Execution Storage]]
- [[Process Topology]]
- [[Code Layout And Dependency Rule]]
- [[Agent Providers Runtime]]
- [[Sandboxing Runtime]]
- [[ExecHost Port]]
