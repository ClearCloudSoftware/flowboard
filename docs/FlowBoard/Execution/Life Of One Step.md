---
tags: [flowboard, execution, behaviour, walkthrough]
module: Execution
---

# Life Of One Step

The drawio *Harness architecture* page traces one step from button to verdict with lettered arrows A to I. This note gives its text and maps each letter to the rules in the other notes. The monitor's version, seen from the screen, is [[Life Of A Task]].

## The nine beats

| | drawio *Life of one step* (verbatim) | Arrow label | Rules |
|---|---|---|---|
| A | *"You press Start, or the engine advances a task. A server action validates the request."* | *"HTTP · server actions"* | [[Starting A Task]] |
| B | *"Next.js writes the task and step rows plus a start_run job, then returns. It never spawns anything."* | *"write rows + enqueue job"* | [[Job Queue]] |
| C | *"The worker leases the job. The engine picks the step; the runner builds the RunSpec and the prompt: contract, read-first paths, output paths."* | *"lease job"* | [[Runner Pipeline]], [[Prompt Assembly]] |
| D | *"If memory is on, the runner recalls (capped) before launch and writes after success. Host side only."* | *"recall / write (local adapter)"* | [[Prompt Assembly]], [[Memory Recall]], [[Memory Commit]] |
| E | *"The permission gate checks the tier; the runner writes mcp.json and the hook settings; the ExecHost starts a sandbox with the worktree at /work."* | *"docker run via ExecHost"* | [[Run Guardrails At Launch]], [[Permission Gate]], [[Sandboxed Run Lifecycle]] |
| F | *"claude runs inside, holding only a dummy key. Every call leaves through the egress proxy, which checks the allowlist and adds the real key toward the model endpoint."* | *"HTTPS_PROXY"* | [[Capability Tools And Egress]], [[Credential Injecting Proxy]], [[Egress Allowlist]] |
| G | *"stream-json on stdout → parser → run_events + live cost → SSE → run viewer and board."* | *"stream-json on stdout"*, *"run_events + cost"*, *"SSE"*, *"tail by seq"* | [[Event Stream And SSE]], [[Stream Parsing And Normalization]] |
| H | *"A question goes shim → ask.sock → broker → questions → Inbox, and to Slack after 5 minutes. After 20 minutes the agent parks and resumes later with --resume."* | *"ask.sock"*, *"questions"*, *"Block Kit after 5 min"* | [[Ask Park And Resume]] |
| I | *"On exit: scan artifacts, read the outcome. A check step runs check_command in a fresh container and its exit code decides. The engine follows on_pass / on_fail and escalates when the loop is spent, stuck, or silent."* | *"artifacts + outcome"*, *"run check_command"* | [[Run Outcomes]], [[Advancement Rules]], [[Loop Guard And Escalation]] |

Beat A covers two triggers, but only one goes through the web process. *Inference:* when the engine advances a task, `advance_task` is a job the worker runs (PRD §8), so the server action in A and the Next.js write in B apply to **Start** only. After an advance, the worker enqueues the next `start_run` itself ([[Execution Open Questions]] #70).

> [!warning] The shipped code differs
> The provider layer built on 2026-10-18 contradicts four beats; the sequence below still draws the design.
> - **E, F.** No `mcp.json` or hook settings are written: the adapter passes the ask-user server, permission mode and guards to the provider in memory ([[Agent Providers Open Questions]] #4). The Claude adapter runs the CLI on the host with the owner's subscription login and strips `ANTHROPIC_API_KEY`; a dummy key behind a proxy does not fit that login ([[Claude Code Adapter]]).
> - **G.** No stdout parser: the Claude adapter reads the Agent SDK's typed messages, and OpenCode its server's SSE events ([[Normalized Event Envelope]]).
> - **H.** The shim (`packages/ask-user`) forwards over `ask.sock` to a broker inside `run-agent`, which asks in the terminal ([[Ask User MCP Server]]).

As built in run-flow (2026-10-23), the run-flow host stands in for the worker from C to I, in one process, with no web process, job or lease (A, B):

- **C.** The engine picks the step. The host builds the `RunSpec` from the inputs that exist, the output paths, and the task text plus any note and missing-inputs lines ([[Prompt Assembly]]).
- **D, E, F.** No memory, no permission tier and no sandbox: the host adds the `flowboard` server (`ask_user`, and `set_outcome` where the verdict is read) and the guards, and the agent runs on the host with the owner's login ([[Run Guardrails At Launch]]).
- **G.** Each event goes to the run's log, `<NNN>-<step>.jsonl`, and to a terminal line; the run's cost is printed when it ends.
- **H.** A broker per agent run asks in the terminal, one prompt at a time; with no terminal, the agent is told *"No one can answer questions in this run."* There is no inbox, Slack or parking (the run-flow plan's *Left out* list).
- **I.** As drawn, except that a check runs on the host in the run's folder.

See [[Run Flow Reference]].

## As a sequence

```mermaid
sequenceDiagram
  autonumber
  participant You
  participant Web as apps/web
  participant DB as SQLite
  participant Wk as apps/worker
  participant Box as Sandbox
  participant Px as Egress proxy
  You->>Web: Start (A)
  Web->>DB: task + step rows, start_run job (B)
  Wk->>DB: lease job (C)
  Wk->>Wk: engine picks step, runner builds RunSpec + prompt (C)
  Wk->>Wk: recall memory, if on (D)
  Wk->>Box: permission gate, mcp.json + hooks, docker run (E)
  Box->>Px: model calls with a dummy key (F)
  Box-->>Wk: stream-json on stdout (G)
  Wk->>DB: run_events + live cost (G)
  Web-->>You: SSE to viewer and board (G)
  Box-->>Wk: ask_user via ask.sock, if it asks (H)
  Box-->>Wk: exit (I)
  Wk->>Wk: scan artifacts, read outcome, apply §8 (I)
  Wk->>DB: next jobs (I)
```

## The three words in beat I

*"escalates when the loop is spent, stuck, or silent"*:

- **Spent**: `max_attempts` reached ([[Loop Guard And Escalation]]).
- **Stuck**: same fingerprint twice ([[Stuck Detection And Fingerprints]]).
- **Silent**: no outcome on a step with conditional edges ([[Run Outcomes]]). PRD §8 parks this one at `awaiting_approval` with reason *"no outcome reported"*; it is a gate, not a loop escalation, but the drawio groups them.

## Related

- [[Execution Index]]
- [[Runner Pipeline]]
- [[Execution Runtime]]
- [[Life Of A Task]]
- [[Sandboxed Run Lifecycle]]
- [[Memory Lifecycle]]
