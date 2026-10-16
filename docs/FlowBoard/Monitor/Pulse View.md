---
tags: [flowboard, monitor, ui, views]
module: Monitor
---

# Pulse View

The home view. Guide: *"Where is every task, and which one wants me first?"* Reach for it *"Always. It's the home view, sorted so the thing that needs you is at the top."*

## A row

| Column | Content |
|---|---|
| Icon | [[Task Status Icons]] |
| Id + title | Task id in medium weight (regular once done), `⑂2` when two steps run, title underneath |
| Flow bar | [[Flow Bar And Step States]] |
| Step | `whereOf()`: the blocking step, the running step (e.g. `build`), `build ∥ tests`, `queued`, `done` or `backlog` |
| Time | `failed 42m`, `waiting 5m`, the longest running run's elapsed time, `71m ago` when done, `in queue`, or `—` |
| Cost | Total in bold; `$X wasted` underneath in brick when over $0.005 |

Done rows drain to grey. The row is a `<button>` with `aria-expanded`; clicking opens the [[Task Row Detail]] under it.

## Filter

| Chip | Shows (`filtered()`) |
|---|---|
| `all` | Every task |
| `active` | Status **run** |
| `blocked` | Status **wait** (gates and questions) |
| `failed` | Status **fail** |
| `done` | Finished tasks |

There is no filter for idle tasks.

## Sort

| Option | Order |
|---|---|
| **needs you first** (default) | `fail · wait · run · idle · done`, then most expensive first |
| **most expensive** | Total cost, descending |
| **longest running** | Elapsed time of the first running run, descending |
| **name** | Task id, A–Z |

Filter, sort and open row live in client state only. Nothing is remembered across reloads.

## Related

- [[Monitor Screen]]
- [[Timeline View]]
- [[Pipeline View]]
- [[Board Projection]]
