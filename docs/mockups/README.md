# Mockups

Clickable mockups of FlowBoard screens, built before the code so the shape of a
module can be argued about while it's still cheap to change.

Each one is a **single self-contained `.html` file** — no build step, no package
install, no dependencies beyond a webfont. Open it straight from disk in a
browser, or run `python3 -m http.server` in this folder.

## What's here

- **[`monitor.html`](./monitor.html)** — the monitoring module. A *needs-you*
  triage band over a task-pulse list, worker slots as a collapsed strip, and
  timeline and pipeline drill-ins. Not a picture: it runs a small flow engine
  (the real graph, join on review, retry edge back to build, concurrency cap)
  over seeded tasks at a ×10 clock, so gates open, retries bill wasted spend,
  and the burn rate climbs while you watch.
  Keys: `j`/`k` move, `↵` open, `a` approve, `r` send back, `1`–`9` answer,
  `v` cycle views, `w` workers.
  [Hosted copy](https://claude.ai/artifact/43h2ufrCza5oYuCWX8Pd5N) (private link).

- **[`monitor-guide.html`](./monitor-guide.html)** — the field guide to that screen.
  Names every status mark and every button, the four rules that move a task
  between steps, and what each decision costs. Its centrepiece is a scrubber
  that walks `auth-refactor` from backlog to done, beat by beat, down either
  branch of the approval gate — the fastest way to understand fan-out, join,
  and the send-back loop.
  [Hosted copy](https://claude.ai/artifact/EsaJgrMfq9iZ2usQLzzAuC) (private link).

  > Documentation is a design tool here: writing this guide surfaced a real
  > accounting bug in the screen — sending a step back made the topbar's
  > **today** total *shrink*, because the spend moved to `wasted` and the two
  > were never added back together.

## Conventions

So the next mockup looks like it belongs to the same product:

| | |
|---|---|
| **Ground** | Warm paper `#FBFAF7`, white surfaces, hairline `#E4E1D8`. Light only — no dark variant. |
| **Signal colour** | Exactly three: petrol `#0E6E74` alive, ochre `#A35A00` wants you, brick `#B0231B` broken. *Done* is drained to stone grey on purpose — it's most of the screen, and colouring it would drown the part that needs you. |
| **Corners** | Zero radius, everywhere. |
| **Depth** | Hairlines and colour fields, not shadows. |
| **Type** | IBM Plex Mono is the primary voice (ids, steps, numbers, logs); IBM Plex Sans only for text a human wrote or reads as prose. |
| **Motion** | 150ms `cubic-bezier(.4,0,.2,1)`, `transform`/`opacity` only, and `prefers-reduced-motion` honoured. |
| **Data** | Mock data comes from FlowBoard's own world — real step names, real models, plausible repos, and at least one detail only this product would have. |

Spend boldness in one place and keep everything around it quiet: in
`monitor.html` the accent runs at full strength on exactly one element, and
when nothing is waiting it disappears from the screen entirely.
