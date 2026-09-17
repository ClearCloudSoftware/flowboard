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

- **[`flow-designer.html`](./flow-designer.html)** — where a recipe gets built.
  A library rail that filters by domain (the role starter packs) and, where
  several authors publish a flow under the *same name*, groups them into one
  entry you expand to compare — steps, gates, cost per task, adoption, fork
  lineage, and a line on what each one actually does differently. Previewing
  one draws that author's real graph on the canvas.
  The canvas has draggable steps, fan-out, joins, and pass/fail routes
  including the retry loop; the inspector edits model, effort, budget, retries,
  the approval gate, the sandbox level and the artifact contract. A live
  validator checks every step's inputs are written by a step before it and
  **blocks Save until they are**.
  [Hosted copy](https://claude.ai/artifact/4T1TN3NcZDkj1PdbnbXPEa) (private link).

- **[`flow-designer-guide.html`](./flow-designer-guide.html)** — the field guide to
  that screen. What to compare when two authors publish the same name (and in
  what order), how to read nodes and pass/fail routes, every step setting and
  what going wrong looks like, the version model, and what the validator checks.
  Its walkthrough borrows a step from `@team-sec/code-review` into your own
  flow, hits the validation wall, and fixes it.
  [Hosted copy](https://claude.ai/artifact/7gZh2YiHmntbkGnNA5fa1T) (private link).

- **[`task-detail.html`](./task-detail.html)** — the whole story of one task.
  A progress spine over four tabs: **Story** (every run with its log, the
  question you answered, the attempt that failed and what it cost), **Plan vs
  built** (the distinctive one — `plan.md`'s items lined up against what
  actually landed in the workspace, each marked *as planned*, *deviated*, *not
  built* or *unplanned*, expanding to the diff hunk), **Files** (artifacts and
  the working tree) and **Cost** (kept versus wasted, against the flow's
  average). Opens at the review gate; approving it actually releases the last
  step, which runs, bills and writes its artifact.
  [Hosted copy](https://claude.ai/artifact/7ZQVVGGTbXkLYPwv5BPQGh) (private link).

- **[`task-detail-guide.html`](./task-detail-guide.html)** — the field guide to
  that screen. Its three sets of marks and why you mustn't read one as another,
  the four plan-vs-built verdicts with what each should make you do, the task
  lifecycle, and what the numbers don't say (agent time is not wall-clock).
  Its walkthrough is a decision rather than a tour: reading the evidence at a
  review gate item by item, then taking either branch and seeing what it costs.
  [Hosted copy](https://claude.ai/artifact/Ps7zX6Jn151u1m2jgr7Bh1) (private link).

- **[`capability-library.html`](./capability-library.html)** — the skills, agents
  and packs that steps draw on (the *Capability library* group in
  [`flowboard-ideation.drawio`](../flowboard-ideation.drawio)). A capability is
  the logical thing; a **pack is one packaging of it for one provider**, so each
  entry shows its Claude and Codex coverage and warns that a step can't use a
  capability with no pack for the provider it runs on. Also: the tools each one
  may use (network-capable ones flagged against default-deny egress), and
  **which flows would break if you removed it** — removal is blocked while
  anything references it. *Install from GitHub* clones, parses `SKILL.md`, shows
  you the manifest and the tools it asks for, and only then installs.
  [Hosted copy](https://claude.ai/artifact/VgdQJScx6bb6kJjxCu6L7W) (private link).

## Conventions

Run `/mockup` and these are applied for you — the skill carries the tokens, a skeleton, the
field-guide pattern, and a linter for the mistakes that are invisible until you render
(`python3 ~/.claude/skills/mockup/scripts/check.py <file>`). The table below is the summary;
anything here overrides the skill's defaults.

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
