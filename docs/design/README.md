# Handoff: Vibe Kanban — Inbox & Board

## Overview
Vibe Kanban is a local-first Kanban board for one developer, where each column is an automated
agent step (research → questioning → planning → implementation → review → summary) rather than a
human workflow stage. Steps are headless Claude Code sessions with their own model and effort
level; some auto-advance, others block on the developer.

This bundle covers the two screens that carry the product:

1. **Inbox** (`/inbox`) — every pending agent question across every project, in one keyboard-driven queue.
2. **Board** (`/p/[slug]`) — the flow's steps as columns, with the card designed in all of its states.

Plus the empty / loading / error states, the "answered from Slack under me" sequence, and light mode.

Not in this bundle (designed later): task detail sheet, live session viewer, costs, flow editor.

## About the Design Files
`Vibe Kanban.dc.html` is a **design reference created in HTML** — a prototype showing intended
look, density and behaviour. It is not production code to copy. It is a single streaming
"design component" file with inline styles and a small logic class that animates the live cost
tickers; there is no Tailwind, no shadcn, and no routing in it.

The task is to **recreate these designs in the target codebase**: Next.js + Tailwind + shadcn/ui.
Every element here was chosen to map onto a default shadcn primitive — Button, Card, Badge, Sheet,
RadioGroup, Checkbox, Textarea, Input, Tabs, Tooltip, Skeleton, Separator, ScrollArea. Nothing here
needs bespoke CSS or a custom component system. Use Tailwind's default spacing and radius scale.

The file opens directly in a browser. It is laid out as a **canvas of artboards**, each with a
visible id badge (1a–1f); pan/zoom to move around it.

## Fidelity
**High-fidelity.** Colours, type, spacing, density and state logic are final and should be matched
closely. Two caveats:

- Exact pixel values were authored against the default Tailwind scale — read `px-3 py-2` etc. from
  the numbers below rather than hard-coding arbitrary values.
- Colours are written as hex for clarity. In the real build they should become CSS variables in the
  shadcn token shape (`--background`, `--card`, `--border`, `--foreground`, `--muted-foreground`,
  `--primary`, plus three semantic states). Mapping is in **Design Tokens**.

---

## Screens / Views

### 1a — Inbox, main state
Artboard `#1a`, 1440px wide.

**Purpose.** The most-used screen. An agent has stopped mid-run and needs an answer to continue, so
latency here costs money and wall-clock time. The developer works the queue from the keyboard
without reaching for the mouse.

**Layout.**
- App chrome bar, height 44px, `px-4`, background `#0c0c0e`, bottom border 1px `#1e1e22`.
  Left: wordmark `vibe kanban` 13px/600. Then nav pills 12px, `px-[9px] py-[5px]`, radius 6px;
  the active pill has background `#18181b`, inactive are `#8b8b93` on transparent. The Inbox pill
  carries its pending count in mono, amber `#fbbf24`. Right: pulsing accent dot (6px) +
  `4 running · $28.40 today` in 11px mono `#8b8b93`.
- Body is a 2-column CSS grid: `minmax(0,1fr)` queue + fixed 320px rail, divided by a 1px border.
- Queue header row, `px-4 py-3`, bottom border: title "Inbox" 15px/600, a `8 pending` outline badge
  (11px mono, 1px `#2e2e33`, radius 4px, `px-[6px]`), and right-aligned the keyboard legend:
  `j` `k` move · `1–9` pick · `↵` submit, each key a 10px mono chip (background `#17171b`,
  1px `#2e2e33`, radius 4px, `px-[5px]`).
- Queue body: `px-4`, `py-3`, `flex flex-col gap-3`.

**The batch group** — the central idea. Questions arrive five to eight at a time from one step, so a
batch is **one Card**, not N cards:
- Card: 1px `#2e2e33`, radius 8px, background `#0d0d10`, `overflow-hidden`.
- Batch header, `px-3 py-[10px]`, background `#111114`, bottom border 1px `#232327`. In order:
  state dot (6px, amber) · task title 13px/600 · project slug 11px mono `#8b8b93` · step name in an
  outline badge · `6 questions` · spacer · **elapsed** 11px mono amber · `→ Slack in 0m 48s`
  10px mono `#8b8b93` · `session ↗` 11px accent link.
- Sub-line, `px-3 pb-3 pt-2`, 12px `#8b8b93`: "Answer all six to unblock the run. Blocked 4m 12s · burning idle."
- Then one **question row** per question, separated by 1px `#1a1a1d`, each `p-3` with a
  `flex gap-[10px]`: number chip · content column · elapsed (11px mono, right).
  - Number chip: 10px mono in a 1px-bordered rounded box, `px-[5px]`; the **focused** row's chip is
    accent (text `#8a8ff5`, border `#33345c`, background `#1a1b2e`), others are neutral.
  - The **focused row** also gets a 2px left border in accent and background `#101018`. Unfocused
    rows carry `border-l-2 border-transparent` so nothing shifts as focus moves.
  - Question text 13px, `leading-[1.45]`. Optional help text 12px `#8b8b93` directly under it.

**The five control types**, one per question row:
1. **Yes / no** — two Buttons in a `flex gap-[6px]`. Primary = default variant (background `#f4f4f5`,
   text `#09090b`), No = outline. Each shows its key inline in 10px mono (`y`, `n`).
2. **Single select, ≤3 short options** — a row of outline Buttons, keys `1` `2` `3` inline
   (used for "Maximum retry window?" → 1 hour / 6 hours / 24 hours).
3. **Single select, >3 or long options** — shadcn RadioGroup, `gap-[6px]`, 14px circles,
   border `#52525b`, label 12px, key hint 10px mono trailing each label.
4. **Multi select** — Checkbox list in a 2-column grid (`gap-[6px] gap-x-5`), 14px squares
   (checked = `#f4f4f5` fill, `#09090b` tick), then a primary Button reading
   `Submit 2 selected` with `↵`, and "or press 0 for none" 11px `#8b8b93`.
5. **Text** — Textarea, min-height 44px, background `#0b0b0d`, 1px `#2e2e33`, radius 6px, 12px;
   placeholder `Free text, or leave blank…` in `#8b8b93`. Outline Submit Button + `⌘↵` hint.
6. **Number** — Input `type=number`, width 72px, mono 12px, plus "integer · 1–64" 11px `#8b8b93`.

**The resolved row** (bottom of the batch): a one-line row at `opacity .72`, background `#0b0b0d`,
showing question and chosen answer 12px `#8b8b93`, an outline chip `answered in Slack · 6s ago`,
and an `undo` link. See **1e** for the transition.

**The collapsed / escalated batch** (second group): header only, no rows, 1px border in amber-dark
`#3a2f16`, elapsed `12m 40s` amber, an `escalated to Slack` chip (10px mono `#fbbf24`, background
`#1c1608`, border `#3a2f16`), and `expand ⏎` on the right. Batches past the escalation threshold
collapse by default.

**Queue footer**, 11px mono `#8b8b93`: `answered today: 34 · median response 41s · escalation threshold 5m`.

**Right rail (320px)**, background `#0b0b0d`:
- "Running now" header + count.
- One row per running step, `px-[14px] py-[10px]`, divided by 1px `#16161a`: pulsing 5px accent dot ·
  task title 12px · live cost 11px mono. Second line 10px mono `#8b8b93`: step · `model · effort` · elapsed.
  Parallel branches appear as two rows with the same task title and different steps.
- "Next checkpoints" block: label/ETA pairs in 11px mono.
- Pinned to the bottom: the global shortcut legend, 10px mono `#8b8b93`, `leading-[1.7]` —
  `g i` inbox, `g b` board, `a` approve focused gate, `?` all shortcuts.

### 1b — Board card, all states
Artboard `#1b`. Cards are 268px wide inside a 260px column (`px-3` gutters).

**Always visible, in this order:** state dot (6px) → task title (13px/500, `leading-[1.35]`) →
meta row (10px mono: step name in `#a1a1aa`, `model · effort` in `#8b8b93`, spacer, cost right-aligned).
Everything else is state-conditional.

| State | Border | Dot | Extra |
|---|---|---|---|
| Running | `#232327` | accent, pulsing 2s | 2px hairline progress bar (turns vs. that step's median), fill accent on `#1e1e22` |
| Awaiting answers | `#3a2f16` | amber, static | Attention row: background `#1c1608`, border `#3a2f16`, radius 6px, `px-2 py-[5px]` — "6 questions waiting" 11px `#fbbf24` + elapsed 10px mono |
| Awaiting approval | `#33345c` | accent, static | Attention row in accent: background `#141527`, border `#33345c` — "Plan needs approval" 11px `#a5a9f8` + an `a` key chip |
| Parallel branches | `#232327` | accent, pulsing | Meta step name becomes `2 branches`, cost is the sum. Below: a branch list indented behind a 1px left rule `#2e2e33`, `pl-2`, one 10px mono row per branch (4px dot · branch step · its own cost) |
| Failed / looped back | `#4a2323` | red `#f87171` | Meta carries `attempt 2 of 3` in red. Below: a reason block, background `#1d1010`, border `#4a2323` — "Sent back to Implementation" 11px `#fca5a5` + one line of detail 11px `#8b8b93` |
| Done | `#1e1e22` on `#0d0d10` | hollow (1px `#52525b`) | Title dims to `#a1a1aa`; meta becomes `Done · 8 steps` + total cost, both `#8b8b93`. **No colour at all.** |
| Draggable (Backlog/Todo) | **dashed** `#2e2e33` | 2px-radius square outline, not a circle | A `⠿` grip top-right; meta reads `Backlog` / `drag → Todo`. No cost, no progress |

The dashed border + grip + square marker are the *only* things that say "you can drag this". Engine-driven
cards are solid-bordered with round dots and never respond to drag.

### 1c — Board
Artboard `#1c`, 1440px wide. A real flow is 8 steps + Backlog/Todo/Done = 11 columns; 5 fit.

- Project header, `px-4 py-[10px]`, background `#0c0c0e`: project name 14px/600 · `standard-flow · 8 steps`
  11px mono · spacer · `14 tasks · $28.40 today` · a "Flow" outline Button.
- **Flow strip** — the answer to findability. A full-width row of 11 equal-flex segments,
  `px-[6px] py-1`, radius 4px, 10px mono, each `Name count`. Neutral segments are `#111114` on
  `#232327`; the fixed columns are `#18181b` on `#2e2e33`; a column needing attention takes its
  state colour (amber / accent / red tint) and gains a trailing `●`. Clicking a segment scrolls that
  column into view. Right-hand caption: `● needs me · click to jump`.
- **Columns**, 260px each, divided by 1px `#1e1e22`, body height 620px. Column header `px-3 py-[10px]`:
  optional state dot · name 12px/600 · count 10px mono · spacer · either `⠿ drag` (Backlog, Todo) or
  `engine` in `#8b8b93` (everything downstream). Cards `gap-2`.
- Todo shows the **drop target**: a 44px dashed accent box (border `#33345c`, background `#101018`)
  reading `drop to queue` in 10px mono accent. It only appears while dragging.
- **Footer scroll bar**: a 4px track `#232327` with a `#3f3f46` thumb, plus
  `shift+scroll or h/l to pan · [ ] jumps to next column needing me`.

### 1d — Empty, loading, error
Artboard `#1d`, three 460px panels showing the queue column only. Chrome and rail are unchanged in all three.

- **Empty** (the state seen most often): title + `0 pending` badge, then one line of 13px `#a1a1aa`
  — "Nothing waiting on you. Four steps are running." — then a bordered list of the running steps
  (pulsing dot · task · `step · elapsed` · live cost), then a mono footer:
  `next checkpoint ~4m · questioning step usually asks 5–8 · 34 answered today`.
  No illustration. The empty state's job is to say what is running.
- **Loading**: shadcn Skeletons in the shape of a batch — a header bar with two chips, then a
  question block (78% title, 52% help, two 62×26 button blocks), a separator, a second shorter block.
  Bars are `#1e1e22` (primary) / `#18181b` (secondary), radius 3px, with a 1.6s opacity shimmer.
  Footer: `connecting to orchestrator…`.
- **Error**: a `stale` red badge next to the title; then an error Card (border `#4a2323`,
  background `#141014`) with heading "Lost the orchestrator", a plain-language consequence
  ("Answers you submit now will not reach the running steps"), the raw cause in mono
  (`ECONNREFUSED 127.0.0.1:7717 · retrying in 4s`), and `Retry now` (primary) / `Open logs`
  (outline) + `r` hint. **The stale queue stays visible below at `opacity .45`** with controls
  disabled and an `as of 40s ago` stamp — never blanked.

### 1e — A card resolving under you
Artboard `#1e`, three frames, left to right. A question answered from Slack while the page is open:

1. **Open.** Normal focused row with its controls.
2. **Answered.** Controls swap in place for a single disabled-looking chip reading
   `Yes — answered in Slack` plus an `undo` link; the row drops to `opacity .85`. No colour flash,
   no toast, no motion beyond the opacity change. The row keeps its exact height.
3. **Collapsed.** After 10s the row becomes one line (`px-[11px] py-2`, `opacity .7`) with a
   `Slack · 12s` stamp. Focus stays wherever it was; nothing above the cursor reflows.

Rule: resolution never moves the row the developer is currently on, and never re-sorts the batch.

### 1f — Light mode
Artboard `#1f`, 700px. Same structure, tokens inverted, with the semantic colours **darkened** to
hold 4.5:1 on white: amber `#fbbf24` → `#b45309` (text on amber tint `#92400e`), accent
`#8a8ff5` → `#4f46e5`. Surfaces: page `#ffffff`, chrome `#fafafa`, border `#e4e4e7`,
muted text `#52525b`. Amber tint blocks: background `#fef3e2` on border `#fcd9a8`.

---

## Interactions & Behavior

**Keyboard model (inbox).** `j`/`k` move focus between question rows, crossing batch boundaries.
`1`–`9` pick the nth option of the focused question (and `0` = none, for multi-select).
`y`/`n` answer a yes/no. `Enter` submits the focused question; `Cmd+Enter` submits a textarea.
`Escape` clears the focused answer. `g i` / `g b` navigate; `a` approves the focused approval gate;
`?` opens the shortcut sheet. Focus is visible as the 2px accent left border + accent number chip —
not as a browser outline. Every frequent action shows its key inline, at 10px mono.

**Keyboard model (board).** `h`/`l` pan one column; `[`/`]` jump to the previous/next column that
needs attention; `Enter` opens the focused card's detail sheet.

**Elapsed time.** Recomputed client-side each second from the question's `asked_at`; no server
round-trip. Colour is the only escalation: `#8b8b93` under 2 minutes, amber `#fbbf24` from 2 minutes,
and past the threshold (default 5 minutes) the batch border goes amber-dark and the escalated chip
appears. Elapsed is always right-aligned mono so the column of times scans vertically, and it is
never larger than 11px — legible, never the loudest thing on screen.

**Live cost.** Ticks up while a step runs, ~1s cadence, from the run's token accounting. Always mono,
always right-aligned, never coloured. In the prototype it is simulated in the logic class.

**Drag.** Only Backlog → Todo (either direction). Downstream columns are engine-driven: they are not
drop targets and the drag never starts on them (no grip, solid border, `engine` header label).
Prefer making the affordance absent over letting a drag snap back.

**Answered-elsewhere.** Server push (websocket) marks a question resolved; the client applies the
1e transition. Batches only re-sort when the developer navigates away and back.

**Motion budget.** A 2s opacity pulse on running dots, a 1.6s shimmer on skeletons, and 150ms opacity
fades on resolution. Nothing slides, nothing bounces.

**Empty/loading/error** as specified in 1d. Error additionally disables all controls in the stale
queue and blocks submission rather than queuing it.

## State Management

Inbox:
- `questions: Question[]` grouped by `(taskId, stepRunId)` into batches; a batch renders as one card.
  `Question = { id, type: 'yes_no'|'single'|'multi'|'text'|'number', text, help?, options?, askedAt,
  status: 'open'|'answered'|'collapsed', answer?, answeredVia?: 'ui'|'slack' }`
- `focusedQuestionId` — drives the accent border; `j`/`k` walk the flattened ordered list.
- `draftAnswers: Record<questionId, unknown>` — local until submit, so a partly-typed textarea
  survives a push update to another row.
- `now` — one shared 1s ticker for every elapsed time and cost readout (one interval for the page,
  not one per row).
- `connection: 'live'|'connecting'|'lost'` + `lastSyncAt` — drives 1d.
- `runningSteps: StepRun[]` for the rail and the empty state.

Board:
- `columns: StepDef[]` (fixed Backlog/Todo/Done + the flow's steps, in DAG order) and
  `tasks: Task[]` with `currentStepRuns: StepRun[]` (length > 1 = parallel branches).
- `StepRun = { stepDefId, state: 'running'|'awaiting_answers'|'awaiting_approval'|'failed'|'done',
  model, effort, attempt, maxAttempts, costUsd, startedAt, pendingQuestionCount, oldestQuestionAt }`
- `scrollLeft` + a derived `attentionColumnIds` list for the flow strip and `[`/`]`.

Data: everything is local (single user, no auth). One websocket for run events; question mutations
are optimistic with the `undo` window matching the 10s collapse.

## Design Tokens

Dark (the designed default) → shadcn variable:

| Value | Hex | Variable |
|---|---|---|
| Page background | `#09090b` | `--background` |
| Chrome / rail | `#0b0b0d`–`#0c0c0e` | `--muted` surface |
| Card | `#101013` (batch card `#0d0d10`, batch header `#111114`) | `--card` |
| Border | `#232327` (strong `#2e2e33`, hairline `#1a1a1d`/`#1e1e22`) | `--border` |
| Foreground | `#f4f4f5` | `--foreground` |
| Secondary text | `#a1a1aa` | — |
| Muted text | `#8b8b93` | `--muted-foreground` |
| Accent — running, approvals, focus | `#8a8ff5` (text on tint `#a5a9f8`, tint bg `#141527`, tint border `#33345c`) | `--primary` |
| Amber — waiting on me | `#fbbf24` (tint bg `#1c1608`, tint border `#3a2f16`) | `--warning` |
| Red — failed | `#f87171` (text `#fca5a5`, tint bg `#1d1010`, tint border `#4a2323`) | `--destructive` |
| Done | no colour — dim text + hollow dot | — |

Contrast floor: 4.5:1 for all text. `#8b8b93` on `#09090b` is the *lowest* text colour used; nothing
smaller or dimmer. In light mode the muted floor is `#52525b` on white.

Colour discipline: exactly one accent plus three semantic states, and only two of those ever mean
"act now" (amber = a question with a clock, accent = an approval decision). Running is calm, done is
colourless. If every state change shouted, none would be noticed.

**Type.** IBM Plex Sans (UI) + IBM Plex Mono (all numbers, ids, keys, slugs, models, times, costs).
The mono/sans split is load-bearing: anything machine-generated or scannable is mono.
Scale: 20/600 canvas title · 15/600 screen title · 14/600 project title · 13/600 card + batch title ·
13/500 task title · 13/400 question text · 12 body, labels, buttons · 11 meta and elapsed ·
10 mono key chips and micro-labels. Line-height 1.35 on titles, 1.45–1.5 on prose, 1.6–1.7 on
mono legends. Letter-spacing default except `-0.01em` on the 20px title.

**Spacing** (Tailwind scale): `p-3` inside batch rows and cards · `px-4 py-3` on headers ·
`gap-2` between cards in a column · `gap-3` between batches · `gap-[6px]` between controls ·
`gap-2`/`gap-[10px]` between a marker and its content.

**Radius:** 8px cards, 6px buttons/inputs/attention blocks, 4px badges and key chips, 50% dots.
**Borders:** 1px everywhere; 2px only as the focused-row left rule. **Shadows:** none — hierarchy
comes from surface value and border, which keeps density readable.
**Dot sizes:** 6px card/batch state, 5px rail and column headers, 4px branch rows.

## Assets
None. No images, no illustrations, no icon set. The few glyphs used are literal characters:
`⠿` (drag grip), `✓` (checkbox tick), `●` (attention marker in the flow strip), `↗` (external link),
`↵` / `⌘↵` (key hints). If the codebase already has lucide-react (shadcn's default), swap these for
`GripVertical`, `Check`, `ArrowUpRight` at 12–14px in the matching text colour.

## Files
- `Vibe Kanban.dc.html` — the design. Artboards `1a` inbox main, `1b` card states, `1c` board,
  `1d` empty/loading/error, `1e` resolve-under-me, `1f` light mode. Opens in any browser.
- `support.js` — the runtime that renders the design file. Not part of the design; do not port it.
- `brief.md` — the original design brief, including the four screens not yet designed
  (task detail with the plan-vs-built diff, live session viewer, costs, flow editor).

## Open questions for implementation
- Escalation threshold is a setting (default 5 minutes); the prototype exposes it as a tweak.
- Batch collapse-on-escalation is asserted, not user-tested — worth a flag.
- The flow strip assumes ≤ ~14 columns. Beyond that it needs to scroll or group.
