---
tags: [flowboard, sandboxing, behaviour, lifecycle]
module: Sandboxing
---

# Sandboxed Run Lifecycle

> *"Containers are ephemeral — one per run, destroyed on completion."* — PRD §11.1

## One run, start to finish

Built from the drawio *Life of one step* (letters A–I) and PRD §7, §9, §11.1.

```mermaid
sequenceDiagram
  participant W as Worker (runner)
  participant WS as Workspace / ExecHost
  participant B as ask_user broker
  participant C as Container
  participant P as Egress proxy
  W->>W: C · build RunSpec + prompt
  W->>W: D · memory recall (host-side, if on)
  W->>W: E · permission gate checks the tier
  W->>W: E · write mcp.json + settings.json (hooks)
  W->>B: open data/sock/<run_id>.sock
  W->>WS: execHost(task).spawn(claude, args)
  WS->>C: docker run (worktree → /work, plugins ro, ask.sock)
  C->>P: F · every call via HTTPS_PROXY (dummy key)
  P-->>C: allowlisted only; real key added toward the model
  C-->>W: G · stream-json on stdout
  C->>B: H · ask_user via /run/fb/ask.sock
  C-->>W: exit code
  WS->>C: destroy
  W->>W: I · scan artifacts, read outcome, memory write
```

| Letter | Drawio wording |
|---|---|
| E | *"The permission gate checks the tier; the runner writes mcp.json and the hook settings; the ExecHost starts a sandbox with the worktree at /work."* |
| F | *"claude runs inside, holding only a dummy key. Every call leaves through the egress proxy, which checks the allowlist and adds the real key toward the model endpoint."* |
| G | *"stream-json on stdout → parser → run_events + live cost → SSE → run viewer and board."* |
| H | *"A question goes shim → ask.sock → broker → questions → Inbox, and to Slack after 5 minutes. After 20 minutes the agent parks and resumes later with --resume."* |
| I | *"On exit: scan artifacts, read the outcome. A check step runs check_command in a fresh container and its exit code decides."* |

PRD §7 *Sandboxed runs*: *"When the step's sandbox tier is not `host`, the runner does not spawn `claude` directly; it launches the command *inside* the task's container (worktree bind-mounted as `cwd`) through the execution host and streams the same stdout."*

## Lifetime

| Claim | Source |
|---|---|
| *"one per run, destroyed on completion"* | PRD §11.1 |
| *"One container per run/attempt, destroyed on completion — clean state, no cross-run contamination."* | `08` |
| *"one throwaway Docker container per run"*; *"one container per run, destroyed on exit"* | drawio |
| *"ephemeral container per run"* | backlog Story 3.5 |
| *"inside the task's container"* | PRD §7 |

> [!question] Per run or per task?
> Only PRD §7 says *"the task's container"*, which reads as one container per task. Every other source says one per run. See [[Sandboxing Open Questions]].

## Parking and resuming

A run parked after 20 minutes ends its process (PRD §9). The resume is a new `start_run` job (*"enqueue a new `start_run` that resumes with `--resume <claude_session_id> --fork-session"`*), so under one-container-per-run it gets a new container. Where the CLI's session files live between the two containers is not stated. See [[Sandboxing Open Questions]].

## Shell steps

*"A `kind='shell'` step runs no model. The runner executes `step.command` (or the project's `check_command`) in the task's worktree through the same execution host, so it inherits the sandbox."* (PRD §7). `03` §6: *"so it is sandboxed like any agent."*

Drawio *Check container*: *"same image and mounts, no model, no API key: runs check_command and exits with its code"*. *Shell executor* card: *"runs check_command in a fresh sandbox"*. Whether a check gets egress (to install packages, for example) is not stated. See [[Shell Step Execution]].

## Stop

The live viewer's Stop *"kills the process"* (PRD §13). Backlog 3.4: *"Stop: SIGTERM by pid from the route (same machine)"*. Inside a container the host pid belongs to the container runtime; `ChildHandle.kill(signal?)` (`exec-host.ts`) is the normalised way. How Stop reaches a containerised run is not described.

## Restart recovery

Backlog 3.3: *"prefer re‑attach by pid (still alive → keep tailing)"*. Re-attaching to a container after a worker restart is not described.

## Related

- [[Life Of One Step]]
- [[Runner Pipeline]]
- [[ExecHost Port]]
- [[Host-Side Brokers]]
- [[Shell Step Execution]]
