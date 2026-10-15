---
tags: [flowboard, task-detail, screen, ui]
module: Task Detail
---

# Task Detail Screen

The anatomy of `docs/mockups/task-detail.html`, the screen that shows one task's whole story. The field guide opens with the screen's single job:

> *"This screen exists for one moment: an agent has finished work and wants your go-ahead. Everything on it is there so you can answer **should this ship** without reading the diff line by line — and without taking the agent's word for what it did."* — task-detail guide

The mockup opens on the sample task `auth-refactor`, held at its review gate. See [[Sample Task Auth Refactor]].

## Layout

```text
┌ topbar ─────────────────────────────────────────────────────────────────┐
│ ‹ Board / auth-refactor  [‖ waiting on you]      Pause · Send to backlog · Cancel task │
├ header ─────────────────────────────────────────────────────────────────┤
│ Rotate refresh tokens on every use                                      │
│ Every refresh should hand back a new token pair…                        │
│ BILL $2.61   AGENT TIME 22m 00s   WAITING ON YOU 5m   RETRIES 1         │
│ ▬▬▬ ▬▬▬ ▬▬▬ ▬▬▬ ▨▨▨ ░░░   ← the spine, one segment per step             │
├ gate banner (only when something is blocked on you) ────────────────────┤
│ NEEDS YOU · review passed with 2 notes · waited 5m 00s                      │
│ The reviewer passed the change but flagged two things…  [a Approve] [r Send back] [Compare plan vs built] │
├ tabs ───────────────────────────────────────────────────────────────────┤
│ STORY 6 · PLAN VS BUILT 4 · FILES 9 · COST                              │
├ main (selected tab) ───────────────────────────┬ aside ──────────────────┤
│ every run / the plan comparison / files / money │ owner, repo & branch,   │
│                                                 │ workspace, flow, memory,│
│                                                 │ you were asked, timeline│
├ status bar ─────────────────────────────────────┴─────────────────────────┤
│ auth-refactor · 4/6 steps done · $2.61 billed · blocked on you · sandbox container, egress default-deny │
└─────────────────────────────────────────────────────────────────────────┘
```

## Regions

The guide numbers six regions:

| # | Region | Guide wording | Contents in the mockup |
|---|---|---|---|
| 1 | **Topbar** | *"Where the task stands, and the three things you can do to the task itself rather than to a step."* | `‹ Board` back link, task id, status pill, task actions (see [[Task Actions]]) |
| 2 | **Header & spine** | *"The four numbers that matter, then every step as a bar. Click any segment to jump to it."* | Title, description (prose, IBM Plex Sans), four header numbers, the spine |
| 3 | **Gate banner** | *"Only present when something is blocked on you, and it says what the reviewer actually flagged."* | `needs you` strip, the question, Approve / Send back / Compare plan vs built, the reason form |
| 4 | **Tabs** | *"Four ways to read the same task — the story, the plan comparison, the files, the money."* | Story, Plan vs built, Files, Cost; the first three carry a count. See [[Task Detail Tabs]] |
| 5 | **Aside** | *"The facts that don't change: where the code lives, which flow version is pinned, what memory it started with."* | owner, repo & branch, workspace, flow, carried in from memory, you were asked, timeline |
| 6 | **Status bar** | *"The one-line version, including the sandbox posture everything ran under."* | id · steps done · billed · state · `sandbox container, egress default-deny` · key hints |

### Header numbers

| Label | Value in the mockup | Sub-line |
|---|---|---|
| bill | `$2.61` | `$0.48 of it wasted`, or `nothing wasted` |
| agent time | `22m 00s` | `across 5 steps` (steps with any run time) |
| waiting on you | ticking duration, or `—` | `since the review gate opened`, or `nothing pending` |
| retries | `1` | `build needed a second go` (hard-coded text in the mockup) |

What each number does and does not count: [[Task Cost And Wasted Spend]].

### Aside blocks

| Block | Mockup content |
|---|---|
| owner | `you` |
| repo & branch | `flowboard/api` · `flowboard/auth-refactor` |
| workspace | `~/.flowboard/ws/auth-refactor` — *"its own copy of the repo — kept until you clean it up"* |
| flow | `Software delivery @core v4` — amber: *"v5 exists — this task keeps v4 until it finishes"* (see [[Pinned Flow On A Task]]) |
| carried in from memory | three lines tagged `you`, `project`, `task` (see [[Memory Carried Into A Task]]) |
| you were asked | *"1 question, answered in 2m 14s"*; amber *"1 approval still open"* while a gate is open (see [[Questions Within A Task]]) |
| timeline | `created today 09:14`, `started today 09:21`, amber `waiting since HH:MM` while gated |

### Status bar

`<id> · <done>/<total> steps done · $<bill> billed · <state> · sandbox container, egress default-deny`, then key hints. The state reads `blocked on you`, `<step> running`, `finished`, or `in progress`. While a gate is open the hints add `a approve · r send back`; `1-4 switch tab` is always there.

## States of the screen

The mockup derives the whole screen from the step states (see [[Task Detail Runtime]]).

| Screen state | Status pill | Gate banner | Topbar actions |
|---|---|---|---|
| A step is at a gate | `‖ waiting on you` (ochre) | shown | Pause · Send to backlog · Cancel task |
| A step is running | `● <step> running` (petrol) | hidden | Pause · Send to backlog · Cancel task |
| Every step done | `✓ done` (stone) | hidden | Open workspace · Clean up workspace |
| Anything else (e.g. a step queued after send back) | `in progress` (plain) | hidden | Pause · Send to backlog · Cancel task |

The guide's pill table lists only the first three. The fourth, plain `in progress`, appears only in the mockup's code. See [[Task Detail Marks]].

## Empty and edge states

| Where | What shows |
|---|---|
| Story row with no artifact | *"Nothing written yet."* |
| Story row, not started | meta reads `not started`, cost `—` |
| Plan item with no file | the item's `why`, or *"No file in the workspace corresponds to this item."* |
| Unplanned row | *"Nothing in the plan asked for this."* |
| Waiting on you with no gate | `—` / `nothing pending` |
| Cost bar with no spend | `—` |

No source designs a loading, error, or "task not found" state for this screen. Backlog Story 2.3 lists *"Loading and error states. **BUG**"* against the old sheet. See [[Task Detail Open Questions]].

## Responsive and motion

From the mockup's CSS:

- Below 980 px the aside drops under the main column, and the plan-vs-built two-column grid becomes one column, with the "built" side indented behind a left rule.
- Below 600 px a story row hides its **cost** column. The rule hides the row's fourth child: icon, name, duration, cost, attempts.
- `prefers-reduced-motion` cuts animations and transitions to near zero. The running spine segment's sweep is an animation.

## Design language

The house rules in `docs/mockups/README.md` apply: light only, zero radius, hairlines not shadows, IBM Plex Mono as the primary voice and Plex Sans for prose. Three signal colours: petrol `#0E6E74` *alive*, ochre `#A35A00` *wants you*, brick `#B0231B` *broken*. *"Done is drained to stone grey on purpose — it's most of the screen, and colouring it would drown the part that needs you."*

> [!warning] Sheet or page?
> The PRD (§13) and backlog Story 2.3 describe a **task detail sheet** opened from a board card. The drawio has both: a **Task detail sheet** card on its *FlowBoard ideation* page, and a route, **`Task detail /t/[id]`**, on its *Harness architecture* page. The mockup is a full page with a `‹ Board` back link. See [[Task Detail Open Questions]].

## Related

- [[Task Detail Index]]
- [[Task Detail Controls]]
- [[Task Detail Tabs]]
- [[Task Detail Marks]]
- [[Deciding At A Gate]]
