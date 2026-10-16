---
tags: [flowboard, memory, defaults, sample]
module: Memory
---

# Memory Defaults And Sample Content

Memory ships with no seed content. A fresh install has no memories, and the adapter is `none`.

## Defaults

| Setting | Default | Source |
|---|---|---|
| Adapter | `none` | PRD §11.2, §13; `06` §15 |
| `max_recall_chars` | 6,000 (*"roughly 1,500 tokens"*) | PRD §7, `09` |
| Recall `limit` | not stated | — |
| Enabled scopes | not stated; `09` and the README recommend `user` first | `09` recommendation 2, architecture README open decision 4 |
| First real adapter | `local` | PRD §11.2, `09` |
| Mem0 mode | self-hosted | `09`, PRD §17, drawio D10 |

## Sample memories (mockups)

The task-detail mockup's `MEMORY` array, for the sample task `auth-refactor` (repo `flowboard/api`):

| Scope tag | Text |
|---|---|
| `you` | Prefers vitest; never suggest jest for this repo. |
| `project` | Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window. |
| `task` | Attempt 1 died on an egress denial — npmjs.org is now on this step's allowlist. |

## Example facts in the prose

| Example | Scope | Source |
|---|---|---|
| *"uses pnpm"* | user | `09` |
| *"rejects speculative abstractions"* | user | `09` |
| *"now uses vitest, not jest"* | (contradiction example) | `09`, feature map §21 |
| *"what `researcher` learned about this stack"* | agent | `09` |
| *"questions `/grill-me` has settled"* | agent | `09` |

`researcher` is not a seed: the seed flow's research agent is `scout` (PRD §15), and backlog Story 1.2 puts *"The `researcher` web-research template"* out of v1.

## Sample tasks about memory

The monitor and inbox mockups use building memory itself as sample work:

| Mockup | Sample | What it shows |
|---|---|---|
| `monitor.html` | Task `mem0-adapter`, *"Wire the self-hosted memory port behind the seam"*, repo `flowboard/core`; research and plan done, build ∥ tests running | Log lines: `read core/src/ports/memory-store.ts`, `edit core/src/adapters/mem0/client.ts`, `run docker compose up -d mem0`, `✓ mem0 healthy on :8088`, `edit core/src/adapters/mem0/index.ts` |
| `inbox.html` | `RUNNING`: `mem0-adapter` build (opus, 0.14) and tests (sonnet, 0.05) | Two *running now* slots; the last values are per-minute rates summed into the *costing you* per-hour figure |

> [!note]
> The sample wires Mem0 first, not `local`. It is illustration, not a design decision; the PRD build order is `none` → `local` → Mem0. The port `:8088` and the compose service name appear nowhere else. See [[Monitor Sample Data]].

## Related

- [[Memory Settings]]
- [[Memory In The UI]]
- [[Sample Task Auth Refactor]]
- [[Memory Index]]
