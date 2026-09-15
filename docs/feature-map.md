# FlowBoard — Component & Feature Map

A plain-English tour of everything FlowBoard does, broken into components, features, and the smaller
pieces inside them — and a place to **braindump** new ideas. The map is the current thinking from the
PRD, the backlog, and `docs/architecture/`; the `💡` slots are yours to fill.

## How to use this

- Skim to find the part your idea touches, then drop a bullet under its **`💡 Ideas`** line.
- A brand-new *component* idea (something FlowBoard doesn't do at all yet) goes in the
  [Parking lot](#parking-lot) at the bottom.
- An idea that spans lots of components (safety, design, testing…) goes in
  [Across everything](#across-everything).
- Keep it rough. This is a thinking space, not a spec — anything that firms up graduates to the PRD or backlog.

**Legend:** `💡` a slot for your ideas · `❓` a decision we still owe ourselves · `→` where to read the deep version.

## Contents

- **A. Working with your code** — [1 Projects](#1-projects) · [2 Flows](#2-flows) · [3 Tasks](#3-tasks) · [4 The engine](#4-the-engine) · [5 The board](#5-the-board)
- **B. Running the agents** — [6 Agent providers](#6-agent-providers) · [7 The runner](#7-the-runner) · [8 The work queue](#8-the-work-queue) · [9 Live run viewer](#9-live-run-viewer) · [10 Sandboxing](#10-sandboxing)
- **C. You in the loop** — [11 Questions](#11-questions) · [12 The inbox](#12-the-inbox) · [13 Notifications](#13-notifications)
- **D. Files & building blocks** — [14 Workspaces](#14-workspaces) · [15 Artifacts](#15-artifacts) · [16 The library](#16-the-library) · [17 Importing work](#17-importing-work)
- **E. Seeing & steering** — [18 Cost tracking](#18-cost-tracking) · [19 Settings](#19-settings) · [20 Plumbing](#20-plumbing)
- **F.** [Across everything](#across-everything) · [Parking lot](#parking-lot)

---

## A. Working with your code

### 1. Projects
*Your codebases and the settings for how agents work on each one.*

- **Connect a codebase** — Point FlowBoard at a folder on your machine that holds a git repository. That's the code agents will read and change.
- **A home screen listing your projects** — The first screen shows each project as a card with how many tasks are in each state and how much you've spent this week.
- **Create a new project** — A short form: name it and choose which recipe new tasks should follow (or start empty).
- **A default recipe per project** — Each project remembers which recipe to use, so new work starts the right way without you picking every time.

**💡 Ideas:** _(add ideas)_

### 2. Flows
*The recipe a task follows — an ordered set of steps, each one an agent doing a single job.*

- **Steps** — Each step is one job for one agent: what to do, which AI model to use, how hard to think, how much it may spend, and whether it should pause for your approval.
  - *Skill or agent* — A step can run a saved **skill** (a packaged instruction, like a slash-command) or a defined **agent** (a role with its own personality and instructions).
  - *Guardrails* — A spending cap, a limit on back-and-forth turns, which tools it's allowed, and how many times it may retry before giving up.
  - *Auto or approval* — Some steps move on by themselves when done; others stop and wait for your go-ahead.
- **Connections between steps** — Steps are wired together ("after this, do that"). A connection can always fire, or only when the previous step passed, or only when it failed.
  - *Branching* — One step can kick off several next steps at once (for example, write code and write tests in parallel).
  - *Joining* — A step can wait for several earlier steps to all finish before it starts (review waits for both code and tests).
  - *Loops* — A failed review can send the task back to an earlier step to try again.
- **Each step declares what it needs and what it makes** — So FlowBoard can check the whole recipe hangs together before you save it, and warn you if a step needs something no earlier step produces.
- **Versions** — Editing a recipe creates a new version instead of changing the old one, and any task already running keeps the version it started on — so edits never disrupt work in progress.
- **A visual editor** — Build and rewire recipes on a canvas (drag steps, draw connections) or as a simple list, with a live warning if the recipe doesn't hold together.
- **Ready-made recipes** — Ships with a couple of complete ones (a full software-development pipeline and a research pipeline) so you're not starting from a blank page.

**💡 Ideas:** _(add ideas)_

### 3. Tasks
*The individual pieces of work — a feature, a bug, a question — that move through a recipe.*

- **Create and track work** — Add a task with a title and description; it moves through states from "backlog" to "in progress" to "done" (or "blocked" / "failed" if something goes wrong).
- **Start a task** — Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow.
- **Pause, send back, or cancel** — Send a task back to the backlog (keeping its workspace), or cancel it — which stops any running agents and tidies up.
- **A detail view per task** — Open a task to see its whole story: each step, how long it took, what it cost, whether it needed approval, links to everything it produced, and a side-by-side "what we planned vs what got built."
- ❓ Should starting a task happen automatically when you pull it out of the backlog, or be a separate "Start" button?

**💡 Ideas:** _(add ideas)_

### 4. The engine
*The behind-the-scenes decision-maker that works out what happens next after each step.* → [deep dive](./old/architecture/02-core-and-engine.md#3-flow-execution-engine-write-model)

- **Decide the next step** — When a step finishes, the engine reads the recipe and starts whatever comes next.
- **Follow pass/fail paths** — If a step reports success or failure, the engine takes the matching route (a passed review moves on; a failed one loops back).
- **Run branches in parallel and wait for them** — It starts several branches at once when the recipe fans out, and holds a later step until every branch it depends on is done.
- **Retry loops with a safety limit** — When work loops back to be redone, the engine counts the attempts and gives up cleanly after a set number instead of looping forever.
- **Your call wins** — If you approve or reject a step, your decision overrides whatever the agent concluded, and a rejection carries your reason into the next attempt.
- ❓ Exactly how many retries before we declare a task failed.

**💡 Ideas:** _(add ideas)_

### 5. The board
*The at-a-glance view: columns are the steps of the recipe, and each task sits in whichever step it has reached.*

- **Columns come from the recipe** — A "Backlog" and "To do" column, then one column per step, ending in "Done."
- **Cards that tell you the state** — Each card shows the title, the current step, a status dot (running / waiting on you / needs approval / failed), a live running cost, and a badge when a task has split into parallel branches.
- **Drag only where it's honest** — You can drag cards between Backlog and To do, but not further: everything past that is driven by the engine, so dragging there would misrepresent what's happening.
- **Click to dive in** — Opens the task's detail view.
- **Keyboard-friendly** — Move around and open cards without reaching for the mouse.

**💡 Ideas:** _(add ideas)_

---

## B. Running the agents

### 6. Agent providers
*The layer that lets FlowBoard drive different AI coding tools (like Claude or Codex) interchangeably.* → [deep dive](./old/architecture/01-ports.md#agentprovider)

- **Swap the underlying AI** — A step doesn't care which vendor's tool runs it; FlowBoard translates its request into whatever that tool understands, so you're never locked to one vendor.
- **Know each tool's abilities** — Tools differ in what they support (thinking effort, resuming a session, reporting cost). FlowBoard checks what each can do and adapts, hiding options a tool can't handle.
- **One shared format for results** — Whatever tool runs, its output (messages, tool calls, results, cost) is translated into one common format the rest of the app understands.
- **A test stand-in** — A fake provider that replays a recorded session, so the whole system can be tested without spending real money.
- ❓ Try FlowBoard against a second real tool (Codex) early, to be sure the "swap the AI" design actually holds.

**💡 Ideas:** _(add ideas)_

### 7. The runner
*The part that launches an agent for one step, hands it the right instructions, and watches it work.*

- **Assemble the instructions** — Builds the agent's prompt from the task, the files it should read first, where to write its output, and a reminder that it's running unattended (so it asks questions the right way instead of stalling).
- **Stream the play-by-play** — Captures everything the agent does and turns it into a readable, line-by-line account.
- **Track cost as it goes** — Adds up spending live, so you watch a number climb rather than only seeing a total at the end.
- **Wrap up cleanly** — When the agent finishes, it records success or failure, files away whatever the agent produced, and hands back to the engine.
- **Draft mode** — A switch that forces every step onto the cheapest, fastest AI while you're tinkering with the recipe rather than the code.

**💡 Ideas:** _(add ideas)_

### 8. The work queue
*A to-do list for the system itself, so slow jobs happen in the background instead of freezing the screen.*

- **Hand off the slow work** — The screens never run agents directly; they drop a job on the queue and a background worker picks it up.
- **Do the right amount at once** — A cap on how many agents run at the same time, so your machine isn't overwhelmed.
- **Survive a restart** — If the background worker restarts, it reconnects to work that was already running instead of losing it.

**💡 Ideas:** _(add ideas)_

### 9. Live run viewer
*A live screen that streams an agent's session as it happens.*

- **Watch in real time** — Messages and actions appear as the agent produces them; reopen the page and it catches you up from the start.
- **Expand the details** — Tool calls fold away by default and open up to show exactly what went in and what came back.
- **A running tally** — A pinned footer with elapsed time, number of turns, and live cost.
- **Stop button** — End a run you don't want to keep paying for.

**💡 Ideas:** _(add ideas)_

### 10. Sandboxing
*Running each agent inside a locked-down box so a misbehaving or manipulated agent can't touch the rest of your machine or the internet.* → [deep dive](./old/architecture/08-sandboxing.md)

- **Levels of protection** — From "no box" (fast, for work you trust) up to strong isolation for untrusted code. You pick based on how much you trust what the agent will read.
- **A wall around the network** — By default the agent can't reach the internet at all, except a short allow-list of places it genuinely needs (the AI service, package registries). So even a tricked agent can't leak your secrets.
- **Least privilege** — It runs as a limited user, can't gain new powers, gets a throwaway filesystem, and only ever sees the one task's files — never your keys or your other projects.
- **Hard limits** — Ceilings on memory, processing, and time, so a runaway agent is stopped by the box, not just by its spending budget.
- **The safety rule** — Fully-autonomous mode (no approval on each action) is only allowed when the agent is inside a box; otherwise FlowBoard refuses it.
- ❓ How strong a box to use by default, and how an agent asks you questions from inside a sealed box.

**💡 Ideas:** _(add ideas)_

---

## C. You in the loop

### 11. Questions
*How a working agent pauses to ask you something and waits for the answer.* → [deep dive](./old/architecture/04-hitl-and-notify.md#9-human-in-the-loop-protocol)

- **Ask in batches** — An agent can pose a whole set of questions at once, which beats a slow drip of one at a time.
- **Pause and pick back up** — If you don't answer within a while, the agent saves its place and stops rather than hanging; when you answer, it resumes right where it left off with your answers in hand.
- **One shared question format** — A simple set of shapes (yes/no, pick-one, pick-many, free text, a number) that looks and works the same everywhere you might answer.
- ❓ Keep a short "undo" window after you answer, or make answers final.

**💡 Ideas:** _(add ideas)_

### 12. The inbox
*One screen that gathers every question waiting on you, across all tasks, so you can clear them fast.*

- **Everything waiting, most-urgent first** — Grouped by task, each with the right control for its question type.
- **Built for the keyboard** — Move between questions, pick options with number keys, submit, and approve — all without the mouse — because this is the screen you'll live in.
- **Stays in sync** — Answer the same question somewhere else (like chat) and the inbox updates itself instantly.
- **A context panel** — What's running right now, what it's costing, and roughly when the next decision will land.

**💡 Ideas:** _(add ideas)_

### 13. Notifications
*When a question sits unanswered, FlowBoard nudges you on another channel so nothing stalls silently.* → [deep dive](./old/architecture/04-hitl-and-notify.md#10-notification--escalation--notifier-port)

- **Escalate after a wait** — If a question isn't answered within a set time, it's posted to your chat tool with buttons to answer right there.
- **Answer from anywhere** — Answer in chat and the web updates; answer on the web and the chat message updates to show it's handled — and whoever answers first wins.
- **More than one channel** — Built so chat, email, or other channels can all plug in, not just one.

**💡 Ideas:** _(add ideas)_

---

## D. Files & building blocks

### 14. Workspaces
*A private copy of the code for each task, so parallel tasks never trip over each other.*

- **An isolated copy per task** — Its own branch and folder, created when the task starts.
- **Tidy up on your terms** — The workspace stays until you choose to clean it up (only once the task is finished or cancelled), never deleted from under you.
- **Stronger isolation when you want it** — The same idea can run inside a locked-down box for tasks you want fully sealed off (see [Sandboxing](#10-sandboxing)).

**💡 Ideas:** _(add ideas)_

### 15. Artifacts
*The documents agents produce as they work — a research brief, a plan, a summary — kept as real files.* → [deep dive](./old/architecture/05-environment-and-registry.md#11-artifact-store--workspace--two-ports)

- **Real files, not hidden in a database** — Everything an agent produces is a normal file in the task's workspace, tracked in git like any other change, so it's easy to read and review.
- **A tidy hand-off** — Each step says what it produces, and FlowBoard automatically files away the matching outputs when the step finishes.
- **Read them nicely** — Open any artifact in a formatted viewer, and compare two of them (like the plan against the final summary) side by side.

**💡 Ideas:** _(add ideas)_

### 16. The library
*Your reusable building blocks: skills (packaged instructions) and agents (defined roles) that steps draw from.* → [deep dive](./old/architecture/05-environment-and-registry.md#13-skillagent-registry--capability-packs)

- **Install skills** — Add a skill from a public repository; FlowBoard reads its description and makes it available to use in steps.
- **Define agents** — Create a named role with its own instructions, preferred AI model, and allowed tools, then reuse it across recipes.
- **A starter set** — Comes with a handful of ready skills and agents so the sample recipes work out of the box.

**💡 Ideas:** _(add ideas)_

### 17. Importing work
*Bring an existing backlog into FlowBoard from a document — and, later, from tools like GitHub or Linear.* → [deep dive](./old/architecture/05-environment-and-registry.md#14-ingestion--tasksource-port)

- **From a document** — Paste or point at a markdown list and it becomes tasks, understanding both headings and bulleted lists.
- **No duplicates** — Re-importing an edited file updates the existing tasks instead of making copies, because each task gets a stable identity worked out the same way every time.
- **Progress you can see** — The import reports its status (queued → running → "6 created") so you're not left guessing.
- **Room for other sources** — Built so future sources (issue trackers, webhooks) can plug into the same path.

**💡 Ideas:** _(add ideas)_

---

## E. Seeing & steering

### 18. Cost tracking
*A clear picture of where the money goes — because running agents costs real money.*

- **Break it down every way that matters** — Spend per project over time, per step (so you can see what a particular skill really costs you), and per AI model.
- **Wasted spend, called out** — A specific number for money burned on work that got redone or thrown away, so you can actually go after it.
- **Cost per finished task** — Tracked across recipe versions, so you can tell whether a change made things cheaper or more expensive.

**💡 Ideas:** _(add ideas)_

### 19. Settings
*The global switches.*

- **Draft mode** — Force everything onto cheap, fast AI while you iterate on recipes.
- **Sandbox defaults** — How locked-down agents should run by default (see [Sandboxing](#10-sandboxing)).
- **Appearance** — Light, dark, or follow the system.
- **Nudge timing** — How long a question waits before it escalates to chat.

**💡 Ideas:** _(add ideas)_

### 20. Plumbing
*The internal connections that let the screens talk to the data and stream live updates. Mostly invisible, but a real part of the system.*

- **Thin, predictable connections** — Every screen action goes through a small, well-defined request; no cleverness hidden in the screens themselves.
- **Live updates** — A steady stream keeps the board, the viewer, and the inbox current without you refreshing.

**💡 Ideas:** _(add ideas)_

---

## Across everything

Themes that touch many parts at once — dump ideas here when they don't belong to a single box.

- **Safety & trust** — the whole story of keeping autonomous agents from doing harm: the network wall, the box around each run, careful handling of secrets, and the approval gates. → [Sandboxing](#10-sandboxing)
  - **💡** _(add ideas)_
- **Look, feel & accessibility** — a consistent, readable design in light and dark, fully usable from the keyboard, and friendly to screen readers.
  - **💡** _(add ideas)_
- **Testing** — being able to exercise the whole system (including fake, free agents) so changes don't quietly break things.
  - **💡** _(add ideas)_
- **A clear record** — an honest, unchangeable log of what every agent did and what it cost, so you can always look back.
  - **💡** _(add ideas)_
- **Keeping the pieces swappable** — the discipline that lets you change one part (the AI tool, the chat channel, where work runs) without rewriting the rest.
  - **💡** _(add ideas)_

---

## Parking lot

Whole new components that don't exist yet. Seeded with a few starters — add your own.

- **💡 Run agents in the cloud, not just your laptop** — so a big job doesn't tie up your machine, and work can leave the desk.
- **💡 Auto-pick the AI per step** — let FlowBoard choose the best or cheapest model for each step instead of you setting it by hand.
- **💡 A shareable recipe library** — export a recipe and reuse it across projects, or share it with other people.
- **💡 Kick off work from outside** — start a task straight from a GitHub issue, a Slack message, or on a schedule.
- **💡 Steps that aren't AI** — a step could run a plain command, call a service, or be a simple human checklist, not only an agent. → [note](./old/architecture/02-core-and-engine.md#3-flow-execution-engine-write-model)
- **💡 A trends dashboard** — throughput over time, how fast questions get answered, cost per feature.
- **💡 Replay any past run** — step through exactly what happened, to debug it after the fact.
- **💡 Check for hidden manipulation** — scan the files agents produce (and the untrusted things they read) for prompt-injection before the next step trusts them.
- **💡** _(add your own)_
