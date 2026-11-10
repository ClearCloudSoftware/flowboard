---
tags: [flowboard, flow-design, library]
module: Flow Design
---

# Flow Library

The left rail of the designer: *"Every flow you can start from, filtered by domain, grouped when names collide."* (flow-designer guide, anatomy item 2)

> [!note] Designed in the mockup, not in the PRD
> The PRD allows several flows per project (`UNIQUE (project_id, name, version)`) with one default (`projects.default_flow_id`), and has no library. The backlog has a *"Reuse… picker (steps or whole flow from other projects, key uniquified)"* and *"Start from flow type"* (Story 8.2). The feature map's ideas add *"A shared, governed library"* (§16) and *"A shareable recipe library"* (parking lot). The mockup designs the library in full. Where it lives and who owns it is [[Flow Design Open Questions]] #1–#3.

> [!warning] Not built
> As of 2026-11-10, the built library is a list of the recipe files in one folder ([[#As built in the flow designer]]). Same-name grouping, variant cards, `★ org default`, fork lineage, domain chips, `@author` search and preview are not built.

## The same-name problem

> Flows get forked. Someone takes the org's `code-review`, strips a step for speed, and publishes it under the same name — because it *is* code review. So a name alone can't tell you which recipe you're about to run, and picking the wrong one is how a security sweep silently stops happening. — flow-designer guide

The rule: **names are not identifiers**. *"A forked flow keeps the name, because it is still code review."*

So the rail shows **one entry per name**. Where two or more authors publish the same name, the entry shows a count (`3 authors`) and the authors (`@core · @alex · @team-sec`). Expanding it shows *"Same name, 3 different recipes. Compare before you pick one."* and one card per variant. A single-author entry shows its description and `@author vN` instead.

Groups sort by number of variants, then by name.

## A variant card

```
@alex v3
2 steps · 1 gate · ~$0.19/task · 64 runs · yesterday
forked from @core v5            (only when it is a fork)
Single pass, no security sweep. Fine for docs, wrong for anything that ships.
```

Marks: `★ org default` for the golden variant; `open now` for the one on your canvas, which also gets a dark left border. `★ org default` takes precedence, so in the sample data `open now` never shows: the open entry, *Software delivery @core*, is also golden. **Use this flow** does not move the mark.

## What to compare, in what order

From the guide:

| Look at | Because | A bad sign |
|---|---|---|
| Runs & last used | *"Adoption is the honest signal. 410 runs and used two hours ago means it is load-bearing and someone would notice if it broke."* | *"Six runs, last touched a month ago — that is someone's experiment, not a standard."* |
| ★ org default | *"Someone decided this is the one everybody should use. Deviating is a choice you should be able to defend."* | *"Picking a fork over the default without a reason you could say out loud."* |
| Gates | *"Each gate is a place the flow stops and waits for a human. More gates, more of your time, fewer surprises."* | *"Zero gates on anything that ships."* |
| ~$/task | *"What it typically costs end to end."* | *"Paying for the heavy recipe on work that never needed it."* |
| Forked from | *"Lineage. … the difference line tells you how."* | *"A fork of a version well behind the current default: it may be missing fixes."* |
| The difference line | *"The one sentence on what this variant actually does differently. It is the thing to read first and the thing to write when you publish."* | *"No difference line at all — then you are picking on vibes."* |

## The shape glyph

Every entry carries a 62×20 drawing of its graph: grey squares are steps, a dashed red arc is a route that sends work back.

| Shape | Guide wording |
|---|---|
| straight (`linear`) | *"Every step waits for the one before it. Predictable, and slower by exactly the sum of its parts."* |
| fans out (`fan`) | *"Work splits and runs in parallel, then rejoins. Faster in wall-clock, and it occupies more than one worker at a time."* |
| loops back (`loop`) | *"Something can send work back to an earlier step — a failed review, a defect. Cheap to add, expensive when it fires often."* |
| both (`fanloop`) | *"Parallel work *and* a rework path. FlowBoard's own delivery pipeline is this shape."* |
| branches (`branch`) | *"The flow takes one route or another and does not rejoin — a pass path and a failure path that end differently."* |

In the mockup the shape is a stored field. **Proposal:** derive it from the graph (any fan-out, any `on_fail` back-edge, any unjoined conditional split). See [[Flow Design Open Questions]] #3.

As built in the flow designer (2026-10-24), the glyph is derived from the routes, never stored. More than one forward `always` route out of one step makes `fan`, or `fanloop` when the flow also has a rework route. Without a fan, a rework route makes `loop`. Without either, a step with both a forward `on_pass` and a forward `on_fail` route makes `branch`. Anything else is `linear`.

## Domains and search

> **Filtering is by domain, not by folder.** The chips come from FlowBoard's role starter packs — Analysis, PO/PM, SDLC, QA, Platform, Design, Marketing — so a flow is filed by the job it does, not by who wrote it. Search matches names, authors and descriptions together, which is how you find "everything @team-sec published" in one go. — flow-designer guide

Chips: All, Analysis, PO / PM, SDLC, QA, Platform, Design, Marketing, each with a count. See [[Role Starter Flows]]. The guide's seven domains do not match the feature map's six role packs, which keep *Business analyst / Product owner* as one — [[Flow Design Open Questions]] #35.

## Sample library

The mockup ships 17 flows from 5 authors. See [[Seeded Flows]] for the full table.

## Empty state

*"No flow matches that. Try another domain, or clear the search."*

As built in the flow designer (checked 2026-11-10), there are no domains, so the text is *"No flow matches that. Clear the search."* An empty folder reads *"No flows in `<dir>` yet. Name one below to start."*

## As built in the flow designer

As of 2026-11-10, the rail lists every `<name>.yaml` in the flows folder (`code/flowboard/flows/`, or `FLOWBOARD_FLOWS_DIR`), sorted by name. A file whose name breaks the rule for step names (lowercase letters, digits, `-` and `_`) is not listed, and nor is a `.yml` file. The header reads `flow library` and the count.

| Part | As built |
|---|---|
| Search | *Search flows…*; matches name and description |
| An entry | The shape glyph, the name, and the description: the file's first line when that is a comment, else `<name>.yaml` |
| Its stats | `N steps · N gates`, then `$N.NN ceiling`, `no ceiling` for `budget_usd: 0`, or `no budget set` |
| Its mark | `N problems` when `--check` refuses the file; otherwise `open now` on the flow on the canvas |
| New flow | A name field (`new-flow-name`) and **New flow**. It refuses a bad name (*"lowercase letters, digits, - and _ only"*), a taken one (*"a flow has that name"*) and none (*"name the new flow"*). The new file holds only `budget_usd: 0` and opens at once |

Clicking an entry opens it, asking first when the open flow has unsaved edits. There is one entry per file, so there is nothing to group or compare.

## Related

- [[Adopting And Adapting A Flow]]
- [[Flow Design Screen]]
- [[Bundle Packs]] — packs can carry flows
- [[Role Starter Flows]]
