---
tags: [flowboard, monitor, ui, screen]
module: Monitor
---

# Monitor Screen

The monitor, `flowboard/monitor`. Mockup: `docs/mockups/monitor.html`; field guide: `docs/mockups/monitor-guide.html`. No PRD route; the nearest is the board, `/p/[slug]` (PRD §13). See [[Monitor Open Questions]] #1.

> *"Five stacked bands, fixed in place. Only the middle one scrolls. Reading down the screen is reading from most urgent to least."*

## Layout

```
┌ flowboard/monitor  flow research→plan→build∥tests→review→summarize v4   burn $20.28/hr · today $19.46 · wasted $2.55 (N%) · clock · DEMO ×10 ┐  1 topbar
├ ▸ WORKERS ■■■□ 3/4 · queue 5 · $…/hr   build · sandbox-egress · › edit …                                              ┤  2 workers
├ NEEDS YOU 2   oldest first — clear these and everything else runs itself                                               ┤  3 needs you
│ ✕ billing-webhook · build   waited 42m   Attempt 3 of 3 failed — …   [Allow host & retry] [Retry as-is] [Open the log]  │
│ ‖ auth-refactor · review    waited 5m    Review passed. Approve…?    [a Approve] [r Send back] [Read review.md]         │
├ PULSE  TIMELINE  PIPELINE                         all · active · blocked · failed · done · [needs you first ▾]        ┤  4 view switcher
│ ◉ sandbox-egress  Default-deny egress…   [██][██][▓▓|██][  ][  ]   build   33m   $5.96                                 │  5 pulse list (scrolls)
│ …                                                                                                                       │
├ 12 tasks · 4 running · 2 waiting on you · 1 failed · 1 backlog · sandbox container, egress default-deny   j k move · ↵ open · … ┤  6 status bar
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Sample values mix the guide's anatomy diagram (burn, today, wasted, `3/4`, `queue 5`, `NEEDS YOU 2`) with the mockup (`v4`, the clock, `DEMO ×10`, the backlog count and the key hints). At load the mockup itself shows `4/4`, `queue 2` and four needs-you cards. The topbar wraps on narrow widths.

## Regions

| # | Region | Guide description | Note |
|---|---|---|---|
| 1 | **Topbar** | *"The flow you're running, and the three money numbers. Click the flow to open Pipeline."* | Flow shape, version chip, burn, today, wasted, clock, a `DEMO ×10` tag (mockup only). See [[Burn Today And Wasted]] |
| 2 | **Workers** | *"How saturated the machine is. Collapsed to one line; click to see each slot."* | See [[Worker Slots]] |
| 3 | **Needs you** | *"Everything blocked on a human, oldest first. Empty most of the time."* | Scrolls on its own past 42 % of the viewport height, with a sticky header. See [[Needs You Band]] |
| 4 | **View switcher** | *"Pulse, Timeline, Pipeline — plus filter and sort."* | Tools change per view |
| 5 | **Pulse list** | *"One row per task, with its whole flow as a bar."* | See [[Pulse View]] |
| 6 | **Status bar** | *"Totals, and the sandbox posture everything is running under."* | `N tasks · N running · N waiting on you · N failed · N backlog · sandbox container, egress default-deny`, then the key hints. *waiting on you* counts every needs-you item, failures included, so a failed task is counted twice ([[Monitor Open Questions]] #48) |

The middle region (`main`) switches between [[Pulse View]], [[Timeline View]] and [[Pipeline View]].

## Marks

| Mark | Look | Meaning |
|---|---|---|
| Task icon | ✕ ‖ ? ◉ ◌ ✓ | [[Task Status Icons]] |
| Flow-bar cell | flat, outlined, sweeping, hatched, brick with digit, grey | [[Flow Bar And Step States]] |
| `⑂2` | grey, after the task id | Two steps of this task are running |
| `$X wasted` | brick, under the row cost | This task's thrown-away spend |
| `ESCALATED` | ochre outline tag | Waited past the threshold ([[Waiting And Escalation]]) |
| Amber band | ochre wash, solid header | Something is waiting on you |
| Done row | grey text, regular weight | Finished |
| Slot square | petrol when busy | [[Worker Slots]] |
| `GATE` | small label on a pipeline node | The step is an approval gate |
| Dashed brick edge | pipeline | The review → build retry path |
| `NOW` line | brick, on the timeline | The current moment |
| Open row | 2 px ink rail on the left edge | The row whose detail is open. The flow designer's selected step *"matches the row treatment on the monitor"* |

Colours are the three signal colours of the house palette: petrol `#0E6E74` (*run*), ochre `#A35A00` (*wait*), brick `#B0231B` (*fail*), with *done* `#B8B4A8` and *pending* `#EAE7DE`. Gates and questions share ochre; the old handoff gave approvals the accent and questions amber ([[Monitor Open Questions]] #43).

## States of the screen

| State | What shows |
|---|---|
| Nothing waiting | Band 3 is one white line: *"Nothing waiting on you. · N running, N queued"*. Amber leaves the band, but the topbar's *wasted* figure stays ochre ([[Monitor Open Questions]] #49) |
| Something waiting | Band 3 turns amber with the count and cards |
| All slots idle | Worker ticker: *"all slots idle"* |
| Filter matches nothing | *"No tasks match this filter."* |
| Timeline window empty | *"Nothing ran in this window."* |
| Pipeline with nothing parked | *"Nothing is parked on a human — every step is moving."* |
| A row with no artifacts | *"Nothing written yet."* |
| A task not started | Step chips: *"Not started"* |

The mockup has **no loading, error or lost-connection state**. The old handoff designed them for the inbox (*"Lost the orchestrator"*, stale queue at `opacity .45`, never blanked). Backlog Story 3.4 asks for *"Loading, 404 and stream‑lost states"* in the viewer. See [[Monitor Open Questions]] #31.

## Responsive and accessible

- Below 900 px: the flow button in the topbar hides; rows re-flow into a three-column grid with the flow bar on its own line; the row detail stacks; worker rows wrap.
- `prefers-reduced-motion`: animations and transitions are cut to near zero (sweep, flowing edges).
- Hatching *"reads as blocked even in greyscale"*: state is not carried by colour alone.
- ARIA: the bands are labelled sections (`Worker slots`, `Waiting on you`), the view nav is labelled `Views` and its tabs carry `aria-selected`, filter and window chips carry `aria-pressed`, the workers toggle carries `aria-expanded` and `aria-controls`, rows carry `aria-expanded`, the pipeline SVG has `role="img"` and a label, the sort select is labelled.
- Focus: a 2 px petrol `:focus-visible` outline.

Typography: IBM Plex Mono for the whole screen (ids, steps, numbers, logs) at 13 px; IBM Plex Sans for *"text a human wrote or reads as prose"* (mockups README): task titles, questions and notes. Light only, zero radius. PRD §13 says *"Dark-first"*: [[Flow Design Open Questions]] #34.

## Related

- [[Monitor Controls]]
- [[Monitor Overview]]
- [[Pulse View]]
- [[Needs You Band]]
