---
tags: [flowboard, memory, ui]
module: Memory
---

# Memory In The UI

Memory has no screen of its own and no mockup. It shows in three places, one of them mocked up.

| Where | What | Source | Mocked up? |
|---|---|---|---|
| Task detail, aside | **carried in from memory**: one line per memory, tagged by scope | `task-detail.html`, `task-detail-guide.html` | Yes |
| Settings | A **memory** section: adapter, endpoint or key ref, enabled scopes, recall limit | PRD §13 | No |
| `/costs` | Memory's own spend, so the page *"shows the net"* | drawio ideation, `06` §12 | No |

## Task detail aside

The mockup renders a `MEMORY` array into the aside, under the label *carried in from memory*:

| Tag | Line |
|---|---|
| `you` | *Prefers vitest; never suggest jest for this repo.* |
| `project` | *Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window.* |
| `task` | *Attempt 1 died on an egress denial — npmjs.org is now on this step's allowlist.* |

Each line is a `.mem` row: the tag in small uppercase, then the text. The guide's anatomy lists *memory* among the aside's fields, and region 5 says the aside holds *"The facts that don't change: where the code lives, which flow version is pinned, what memory it started with."*

The Task Detail set covers this block and its gaps in [[Memory Carried Into A Task]]: recall is per run but the aside shows one list per task, the `agent` scope is missing, the `task` line was written mid-task, and nothing says what shows when memory is off ([[Task Detail Open Questions]] #26).

## Settings

PRD §13: *"Add a **memory** section in settings as well (§11.2): the adapter (`none` / `local` / self-hosted Mem0 / Mem0 cloud), its endpoint or key ref, which scopes are enabled (user / project / agent / task), and the recall limit. Default the adapter to `none`"*. No layout is designed; backlog Story 8.3 (Settings) does not list it. See [[Memory Settings]].

## Costs

The drawio card *Pays for itself, or it's off*: *"memory's own cost is tagged apart, so /costs shows the net."* The Cost And Control set leaves open whether the memory bucket appears on the page: [[Costs Page]], [[Memory Cost Accounting]].

## What is not designed

| Missing | Why it might matter |
|---|---|
| A list of memories, with search, edit or forget | The only way to fix a wrong or stale memory under `local` |
| The *"why did it think that?"* trace | `09` names it as a use of `run_memories`; no screen shows it. The live run viewer or the task's story row would be natural homes (inferred) |
| An inbox-repeats counter | One of memory's two success meters ([[Measuring Memory Payoff]]) |
| An indicator that memory is on | None anywhere in the mockups |

See [[Memory Open Questions]] #19 and #25.

## Related

- [[Memory Carried Into A Task]]
- [[Memory Settings]]
- [[Task Detail Screen]]
- [[Memory Index]]
