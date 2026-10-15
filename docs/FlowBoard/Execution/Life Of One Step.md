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
| D | *"If memory is on, the runner recalls (capped) before launch and writes after success. Host side only."* | *"recall / write (local adapter)"* | [[Prompt Assembly]] |
| E | *"The permission gate checks the tier; the runner writes mcp.json and the hook settings; the ExecHost starts a sandbox with the worktree at /work."* | *"docker run via ExecHost"* | [[Run Guardrails At Launch]] |
| F | *"claude runs inside, holding only a dummy key. Every call leaves through the egress proxy, which checks the allowlist and adds the real key toward the model endpoint."* | *"HTTPS_PROXY"* | [[Capability Tools And Egress]] |
| G | *"stream-json on stdout → parser → run_events + live cost → SSE → run viewer and board."* | *"stream-json on stdout"*, *"run_events + cost"*, *"SSE"*, *"tail by seq"* | [[Event Stream And SSE]] |
| H | *"A question goes shim → ask.sock → broker → questions → Inbox, and to Slack after 5 minutes. After 20 minutes the agent parks and resumes later with --resume."* | *"ask.sock"*, *"questions"*, *"Block Kit after 5 min"* | [[Ask Park And Resume]] |
| I | *"On exit: scan artifacts, read the outcome. A check step runs check_command in a fresh container and its exit code decides. The engine follows on_pass / on_fail and escalates when the loop is spent, stuck, or silent."* | *"artifacts + outcome"*, *"run check_command"* | [[Run Outcomes]], [[Advancement Rules]], [[Loop Guard And Escalation]] |

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
