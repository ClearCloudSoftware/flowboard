---
tags: [flowboard, monitor, viewer, runs]
module: Monitor
---

# Live Run Viewer

One run, streaming live. Feature map §9, PRD §13 `/runs/[id]`, architecture component **#8**. There is **no mockup** for it; the [[Task Row Detail]] log is the closest designed thing.

## What it must do

Feature map §9, *"A live screen that streams an agent's session as it happens."*

- **Watch in real time:** *"Messages and actions appear as the agent produces them; reopen the page and it catches you up from the start."*
- **Expand the details:** *"Tool calls fold away by default and open up to show exactly what went in and what came back."*
- **A running tally:** *"A pinned footer with elapsed time, number of turns, and live cost."*
- **Stop button:** *"End a run you don't want to keep paying for."*

The drawio card *Sticky footer + Stop* (page *FlowBoard ideation*): *"Elapsed, turn count, running cost. Stop kills the process."*

PRD §13: *"Streams the normalised event summaries as they arrive, with tool calls collapsible to show their full input and result. Sticky footer with elapsed time, turn count, running cost. A Stop button that kills the process."*

The old design brief, §4: *"The design problem is **signal density**. A raw log is unreadable. Design the collapsed representation of a tool call (one line: what it did, to what, whether it succeeded) with expansion to full input and output. Distinguish thinking from output from tool activity without four different colours."*

## Backlog Story 3.4

- [ ] *"SSE endpoint tails `run_events` (worker is a separate process), replays from `Last-Event-ID`, sends `end` on terminal state."* **PRD (deviation, keep)**
- [ ] *"Viewer: folded text, collapsible tool calls with input + result, sticky footer with elapsed / turns / **running cost** (estimate from tokens until result lands)."* **PRD/BUG**
- [ ] *"Project link must use slug (today uses id → 404)."* **BUG**
- [ ] *"Dedupe by `seq` on append (StrictMode double‑subscribe duplicates replay)."* **BUG**
- [ ] *"Loading, 404 and stream‑lost states; auto‑scroll opt‑out."* **GAP**
- [ ] *"Stop: SIGTERM by pid from the route (same machine), finalise as cancelled."* **PRD**

Story 3.2 adds the live numbers it depends on: *"persist `num_turns` per assistant turn so the viewer/board show live numbers"* (**PRD/BUG**), and *"`message_delta.usage` is cumulative per message — reset per `message_start`, do not sum across deltas."* (**BUG**)

> [!warning] The shipped code differs
> As built (2026-10-18), the live numbers come from `usage` events, the run's running totals of tokens and turns. Claude's carry no cost until the result, so its running cost still has to be estimated from tokens; OpenCode's carry its own cost. `AgentRun.stop()` settles a run as `{ exitCode: 130, error: 'stopped' }` with the usage so far, but a SIGTERM by pid from outside is not a stop: the run fails with exit 1. See [[Normalized Event Envelope]], [[Agent Run Handle And Result]] and [[Monitor Open Questions]] #36.

## What it shows

Each row is a stored `run_events` row, with partial deltas folded (backlog 3.2: *"fold partial deltas"*): its `type` and a one-line `summary` *"for the viewer (e.g. `Read src/auth/session.ts`, `Bash: pnpm test`)"* (PRD §7). The eight types are `assistant_text`, `thinking`, `tool_use`, `tool_result`, `system`, `usage`, `result`, `error`; `usage`, the running totals, was added on 2026-10-18. As built, only `tool_use` carries a `summary` ([[Monitor Open Questions]] #39), and text arrives whole, one event per text block on Claude and per part on OpenCode, so the adapters leave no deltas to fold. See [[Event Stream And SSE]].

## Milestone

PRD §14 **M3**: *"Worker process, job queue, spawn `claude -p` for one hardcoded step, parse stream-json into `run_events`, SSE session viewer, cost captured on the run. **This is the milestone that proves the whole idea.** Do not proceed until you can watch a real session stream in the browser and see its cost land in the database."* Acceptance (§16): *"A step runs, streams live to `/runs/[id]`, and records a non-zero cost"*; backlog 10.1 adds *"and live turns/cost during the run"*.

> [!warning] The shipped code differs
> Nothing parses `stream-json` into `run_events` (2026-10-18): the Claude adapter runs `claude` through the Agent SDK and reads its typed messages, and no worker, queue, database or viewer exists yet. The stand-in is `pnpm run-agent`, which launches one run from a YAML file and logs its events to `runs/<stamp>-<adapter>.jsonl`. See [[Agent Providers Runtime]].

## Links in

- PRD §10: each inbox question shows *"a link to the live session"*. The drawio *Inbox* card agrees.
- The monitor mockup links to neither the viewer nor the task detail screen. **Proposal:** the [[Task Row Detail]] log header links to `/runs/[id]` for the live or last run ([[Monitor Open Questions]] #4).

## Related

- [[Event Stream And SSE]]
- [[Task Row Detail]]
- [[Monitor Storage]]
- [[Monitor API And Routes]]
