---
tags: [flowboard, flow-design, library]
module: Flow Design
---

# Flow Library

The left rail of the designer: *"Every flow you can start from, filtered by domain, grouped when names collide."* (flow-designer guide, anatomy item 2)

> [!note] Designed in the mockup, not in the PRD
> The PRD allows several flows per project (`UNIQUE (project_id, name, version)`) with one default (`projects.default_flow_id`), and has no library. The backlog has a *"Reuse… picker (steps or whole flow from other projects, key uniquified)"* and *"Start from flow type"* (Story 8.2). The feature map's ideas add *"A shared, governed library"* (§16) and *"A shareable recipe library"* (parking lot). The mockup designs the library in full. Where it lives and who owns it is [[Flow Design Open Questions]] #1–#3.

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

## Domains and search

> **Filtering is by domain, not by folder.** The chips come from FlowBoard's role starter packs — Analysis, PO/PM, SDLC, QA, Platform, Design, Marketing — so a flow is filed by the job it does, not by who wrote it. Search matches names, authors and descriptions together, which is how you find "everything @team-sec published" in one go. — flow-designer guide

Chips: All, Analysis, PO / PM, SDLC, QA, Platform, Design, Marketing, each with a count. See [[Role Starter Flows]]. The guide's seven domains do not match the feature map's six role packs, which keep *Business analyst / Product owner* as one — [[Flow Design Open Questions]] #35.

## Sample library

The mockup ships 17 flows from 5 authors. See [[Seeded Flows]] for the full table.

## Empty state

*"No flow matches that. Try another domain, or clear the search."*

## Related

- [[Adopting And Adapting A Flow]]
- [[Flow Design Screen]]
- [[Bundle Packs]] — packs can carry flows
- [[Role Starter Flows]]
