# Design brief: Vibe Kanban

(The developer's original brief, verbatim. Screens 3–6 are not yet designed.)

## What it is

A local-first Kanban board for a single developer where each column is an automated agent step rather than a human workflow stage. Tasks move through research → questioning → planning → implementation → review → summary, each step being a headless Claude Code session with its own model and effort level. Some steps advance on their own; others stop and wait for me to approve something or answer questions.

It runs on my machine. One user, no login, no onboarding, no marketing surface.

## Who it's for and how it feels

One developer, on a desktop, with the app open on a second monitor all day. This is a cockpit, not a consumer product. It should feel closer to Linear or a good CI dashboard than to Trello or Notion.

- **Dense over airy.** I want to see a lot at once. Generous whitespace is a cost here, not a virtue.
- **Dark-first.** Light mode should work but dark is the one to design.
- **Keyboard-first.** Every frequent action needs a visible shortcut hint. Assume I never reach for the mouse in the inbox.
- **Calm, not alarming.** Things are always running and things frequently need me. If every state change shouts, I stop looking. Reserve strong colour for the two or three states that genuinely need me right now.

## Technical constraints

The build is Next.js + Tailwind + **shadcn/ui**. Design within what shadcn gives by default — its button, card, badge, sheet, radio group, checkbox, textarea, tabs, tooltip, and Recharts for charts. Do not design a custom component system, custom illustration style, or anything that needs bespoke CSS to build. If a layout would take a day to implement, it's the wrong layout.

Use Tailwind's default spacing and radius scale. One accent colour plus semantic states.

---

## Screens to design

In priority order. If you only get to two, make them the first two.

### 1. Inbox (`/inbox`) — the most-used screen

Every pending question across every project, in one queue. An agent mid-run has stopped and needs an answer to continue, so latency here directly costs money and wall-clock time.

Each question carries: the question text, optional help text, the task it belongs to, the step that asked it, how long it has been waiting, and a link to the live session.

Five question types, each needing its own control:
- **Yes / no** — two buttons
- **Single select** — radio group, or buttons when there are three or fewer short options
- **Multi select** — checkbox list with a submit
- **Text** — textarea, Cmd+Enter submits
- **Number** — numeric input

Design problems to solve:
- Questions usually arrive in **batches of five to eight from one step**. Show a batch as a coherent group I can work down, not as eight unrelated cards.
- **Waiting time is the key signal.** After five minutes a question escalates to Slack. Make elapsed time legible at a glance without it becoming the loudest thing on screen.
- Questions can be **answered from Slack while I'm looking at this page**. Design the state where a card resolves under me — it should be clear and not jarring.
- **Empty state matters.** It's the state I'll see most often, and it should tell me what's running rather than showing a shrug illustration.
- Show the keyboard model: `j`/`k` to move, `1`–`9` to pick, `Enter` to submit.

### 2. The board (`/p/[slug]`)

Columns are the flow's steps, bookended by fixed Backlog, Todo and Done columns. A real flow has eight steps, so **the column count exceeds what fits on screen** — solve for horizontal scrolling with the columns that need attention findable.

A card must communicate, without being opened:
- Task title
- Which step it's in and what state that step is in: running, awaiting answers, awaiting approval, failed, done
- **Live accumulating cost** — this ticks up while a step runs
- **Parallel branches.** Implementation and test-writing run at the same time. The card sits at the split point and needs to show that two branches are active, and which
- Attempt number when a step has looped back from a failed review

That's a lot for one card. Work out the hierarchy: what's always visible, what appears only in the states that need it. Show me the card in each of its states side by side.

Only Backlog → Todo is draggable. Everything downstream is engine-driven. Make that legible so I don't try to drag a card and wonder why it snapped back.

### 3. Task detail (a sheet, opened from a card)

A vertical timeline of the steps this task has been through, each with state, model and effort used, attempts, duration and cost. Artifacts (markdown files each step produced) listed as openable links.

Two things need real design attention:
- **The approval gate.** When a step is waiting on me, this is where I approve or reject. It needs to be the obvious focus of the sheet without a modal.
- **The plan-versus-built diff.** The payoff of the whole workflow: what the planning step said would be built, next to what the summary step says was actually built. Two markdown documents, side by side, differences surfaced. This is the screen I'll show people.

### 4. Live session viewer (`/runs/[id]`)

A running agent emits a firehose: assistant text, thinking, tool calls, tool results, file edits. Streaming in real time.

The design problem is **signal density**. A raw log is unreadable. Design the collapsed representation of a tool call (one line: what it did, to what, whether it succeeded) with expansion to full input and output. Distinguish thinking from output from tool activity without four different colours.

Sticky footer: elapsed time, turn count, running cost, and a Stop button.

### 5. Costs (`/costs`)

Not a total. This screen answers "which parts of my flow are worth their price."

- Spend per step definition — does the questioning step earn its cost?
- Spend per model and effort combination
- **Wasted spend** — money burnt on work later discarded by a review sending the task back. This needs its own treatment; it's the number that changes my behaviour
- Cost per completed task, trended over time

Recharts, so keep chart types to bar, line and area.

### 6. Flow editor (`/p/[slug]/flow`) — lowest priority

Steps are a DAG with parallel branches and a loop-back edge, so a pure vertical list understates the structure. But a full node-graph editor is expensive to build. **Propose the cheapest thing that communicates branching honestly** — I'd rather ship a list with a clear connections panel than wait for a canvas.

Each step needs: kind (skill or agent), which one, model, effort, whether it auto-advances or waits for approval, and its input and output artifact types. Invalid configurations (a step needing an artifact nothing produces) need an inline error state.

---

## What I'd like back

Start with the inbox and a board card in all its states. Those two carry the product — if they're right, the rest follows the same rules.

For each screen: the main state, plus the empty, loading and error states. And show the dark version.
