# Build: FlowBoard

You are implementing a complete application from this spec. Read the whole document before writing any code.

## 0. How to work through this

Build in the milestone order given in §14. After each milestone: run the app, verify the acceptance criteria for that milestone, and make a git commit. Do not skip ahead — later milestones depend on earlier schema being correct.

Two things you must verify empirically rather than assume:

1. **The exact shape of Claude Code's `stream-json` events.** Before writing the event parser, run this and save the output to `docs/stream-sample.jsonl`:
   ```
   claude -p "say hello and stop" --output-format stream-json --verbose --include-partial-messages
   ```
   Read the actual events. Write the parser against what you see, not against what you expect. Note especially where cost and token usage appear.

2. **That `claude --version` is on PATH.** If not, stop and tell me.

If any part of this spec turns out to be impossible or wrong given the actual CLI behaviour, stop and say so rather than silently substituting something else.

---

## 1. What this is

A local-first Kanban board where each column is an agent or skill invocation rather than a human workflow stage. A task enters the Backlog, gets promoted to Todo, and then flows through a graph of automated steps — research, planning, implementation, review — each one a headless Claude Code session with its own model and effort setting. Some steps advance automatically when they finish; others park and wait for me to approve or answer questions.

Single user, runs on my machine, no auth.

---

## 2. Stack

- **Next.js 15+**, App Router, TypeScript, `src/` directory
- **SQLite** via `better-sqlite3`, with **Drizzle ORM** and drizzle-kit migrations
- **shadcn/ui** + Tailwind. Install components as needed; do not hand-roll anything shadcn provides
- **Server-Sent Events** for live streaming (not websockets — SSE is enough and simpler in Next.js)
- **A separate worker process** for running agents. Next.js route handlers must never spawn a long-lived child process; they enqueue jobs and the worker picks them up
- `concurrently` to run `next dev` and the worker together under `npm run dev`
- **No auth, no multi-tenancy, no user table.** Do not add them "for later"

Package manager: pnpm.

---

## 3. Repository layout

```
vibe-kanban/
  src/
    app/                    # Next.js routes + API handlers
    components/             # shadcn + app components
    db/
      schema.ts             # Drizzle schema
      index.ts              # db singleton
      migrations/
    lib/
      flow.ts               # DAG traversal + advancement rules
      artifacts.ts          # artifact path resolution, scanning
      cost.ts               # cost rollups
      slack.ts
  worker/
    index.ts                # job loop
    runner.ts               # spawns claude, parses stream-json
    escalation.ts           # 5-minute question timer
  mcp/
    ask-user.ts             # stdio MCP server, talks to the same SQLite file
  seed/
    flows/default.json
  data/
    vibe.db
  drizzle.config.ts
```

The worker and the MCP server both open the same SQLite file directly. Enable WAL mode (`PRAGMA journal_mode = WAL`) so concurrent readers and writers do not block each other. Set `PRAGMA busy_timeout = 5000`.

---

## 4. Core concepts

Get these three distinctions right; everything else follows.

**Flow** — a versioned DAG of step definitions belonging to a project. Editing a flow creates a new version rather than mutating the old one.

**Step definition** — a node in the flow. "Code review, Sonnet, high effort, waits for my approval." Belongs to a flow version.

**Step instance** — one task's occupancy of one step definition. Has state and artifacts.

**Run** — one attempt at a step instance. Rework loops create attempt 2, 3, 4 against the same step instance.

Three more rules:

- **The board is a projection, not the model.** The flow is a DAG. A card's column is derived from its furthest-advanced step instance. When a task has multiple step instances running in parallel, the card sits in the column of the split point and shows a split badge listing the active branches.
- **Flows are version-pinned at task start.** `tasks.flow_id` points at a specific flow version. Editing a project's flow never moves an in-flight task.
- **Loops are guarded.** Any step instance that reaches `max_attempts` (default 3) fails the task rather than looping again.

---

## 5. Database schema

Write this as Drizzle schema. SQL shown for precision.

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  repo_path     TEXT NOT NULL,           -- absolute path to the git repo
  default_flow_id TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE flows (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE (project_id, name, version)
);

CREATE TABLE step_defs (
  id             TEXT PRIMARY KEY,
  flow_id        TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,          -- stable slug, e.g. "code_review"
  name           TEXT NOT NULL,          -- column header, e.g. "Code review"
  kind           TEXT NOT NULL,          -- 'skill' | 'agent' | 'manual'
  skill_id       TEXT REFERENCES skills(id),
  agent_id       TEXT REFERENCES agents(id),
  prompt_template TEXT,                  -- appended to the invocation, supports {{placeholders}}
  model          TEXT NOT NULL DEFAULT 'sonnet',   -- passed to --model
  effort         TEXT NOT NULL DEFAULT 'medium',   -- low|medium|high|xhigh|max
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  allowed_tools  TEXT,                   -- JSON array, null = unrestricted
  max_turns      INTEGER,
  max_budget_usd REAL,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  advance_mode   TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'approval'
  requires       TEXT NOT NULL DEFAULT '[]',    -- JSON array of artifact type keys
  produces       TEXT NOT NULL DEFAULT '[]',    -- JSON array of artifact type keys
  board_order    INTEGER NOT NULL,
  is_entry       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (flow_id, key)
);

CREATE TABLE step_edges (
  id          TEXT PRIMARY KEY,
  flow_id     TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  from_step   TEXT NOT NULL REFERENCES step_defs(id) ON DELETE CASCADE,
  to_step     TEXT NOT NULL REFERENCES step_defs(id) ON DELETE CASCADE,
  condition   TEXT NOT NULL DEFAULT 'always'  -- 'always' | 'on_pass' | 'on_fail'
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id       TEXT REFERENCES flows(id),   -- null while in backlog, pinned on promotion
  title         TEXT NOT NULL,
  body          TEXT,
  status        TEXT NOT NULL,   -- 'backlog'|'todo'|'running'|'blocked'|'done'|'failed'|'cancelled'
  import_key    TEXT,            -- stable key for idempotent md import
  branch_name   TEXT,
  worktree_path TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (project_id, import_key)
);

CREATE TABLE step_instances (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_def_id  TEXT NOT NULL REFERENCES step_defs(id),
  state        TEXT NOT NULL,   -- 'pending'|'running'|'awaiting_answers'|'awaiting_approval'|'done'|'failed'|'skipped'
  attempts     INTEGER NOT NULL DEFAULT 0,
  outcome      TEXT,            -- 'pass'|'fail'|null, drives conditional edges
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE runs (
  id                TEXT PRIMARY KEY,
  step_instance_id  TEXT NOT NULL REFERENCES step_instances(id) ON DELETE CASCADE,
  attempt           INTEGER NOT NULL,
  claude_session_id TEXT,
  pid               INTEGER,
  state             TEXT NOT NULL,  -- 'starting'|'running'|'parked'|'succeeded'|'failed'|'cancelled'
  exit_code         INTEGER,
  cost_usd          REAL DEFAULT 0,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  num_turns         INTEGER DEFAULT 0,
  wasted            INTEGER NOT NULL DEFAULT 0,  -- 1 if superseded by a rework loop
  error             TEXT,
  started_at        INTEGER,
  ended_at          INTEGER
);

CREATE TABLE run_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  type       TEXT NOT NULL,     -- normalised: 'assistant_text'|'thinking'|'tool_use'|'tool_result'|'system'|'result'|'error'
  raw        TEXT NOT NULL,     -- the original JSON line
  summary    TEXT,              -- short human-readable line for the session viewer
  created_at INTEGER NOT NULL
);
CREATE INDEX run_events_run_seq ON run_events(run_id, seq);

CREATE TABLE artifacts (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_instance_id TEXT REFERENCES step_instances(id),
  type             TEXT NOT NULL,   -- artifact type key, e.g. 'research_brief'
  path             TEXT NOT NULL,   -- absolute path on disk
  bytes            INTEGER,
  created_at       INTEGER NOT NULL
);

CREATE TABLE questions (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_instance_id TEXT REFERENCES step_instances(id),
  run_id           TEXT REFERENCES runs(id),
  batch_id         TEXT,            -- groups questions asked together
  prompt           TEXT NOT NULL,
  help             TEXT,
  kind             TEXT NOT NULL,   -- 'yes_no'|'single_select'|'multi_select'|'text'|'number'
  options          TEXT,            -- JSON array of {value,label} for select kinds
  required         INTEGER NOT NULL DEFAULT 1,
  state            TEXT NOT NULL,   -- 'pending'|'answered'|'expired'|'cancelled'
  answer           TEXT,            -- JSON
  answered_at      INTEGER,
  answered_via     TEXT,            -- 'web'|'slack'
  escalated_at     INTEGER,
  slack_channel    TEXT,
  slack_ts         TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX questions_pending ON questions(state, created_at);

CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,   -- the slash command, e.g. 'grill-me'
  name          TEXT NOT NULL,
  description   TEXT,
  source        TEXT NOT NULL,          -- 'local'|'github'
  repo_url      TEXT,
  git_ref       TEXT,
  install_path  TEXT NOT NULL,          -- directory passed to --plugin-dir / --add-dir
  frontmatter   TEXT,                   -- JSON
  installed_at  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL,
  default_model  TEXT NOT NULL DEFAULT 'sonnet',
  default_effort TEXT NOT NULL DEFAULT 'medium',
  allowed_tools  TEXT,                  -- JSON array
  is_builtin     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- 'start_run'|'advance_task'|'escalate_question'|'import_backlog'
  payload    TEXT NOT NULL,
  run_after  INTEGER NOT NULL,
  state      TEXT NOT NULL,   -- 'queued'|'leased'|'done'|'failed'
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  leased_at  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX jobs_ready ON jobs(state, run_after);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 6. Artifacts live on disk, not in the database

Artifacts are files inside the task's worktree, under:

```
<worktree>/.vibe/task-<task-id>/
  01-research_brief.md
  02-questions.json
  02-answers.json
  03-plan.md
  04-explainer.md
  07-review.md
  08-summary.md
```

The `artifacts` table stores only type, path and metadata. Rationale: Claude Code reads files natively so there is no retrieval layer to build, git tracks the files so they are diffable and reviewable, and the "compare what was planned against what was built" step becomes a plain diff of two files.

**Artifact types are declared, and the declaration is checked.** Each step definition lists `requires` and `produces` as arrays of artifact type keys. When saving a flow, validate that every `requires` entry is produced by some ancestor step in the DAG. Reject the save with a clear error if not. This turns a whole class of runtime failures into design-time errors, and lets the flow editor grey out invalid connections.

After a run completes, the runner scans `<worktree>/.vibe/task-<id>/` for files created or modified during the run and registers any that match the step's declared `produces` types. The agent may also register one explicitly via the `declare_artifact` MCP tool. Do both — scanning catches the case where the agent forgets to call the tool.

Seed these artifact types: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `review`, `summary`.

---

## 7. The runner

The worker leases jobs from the `jobs` table (`UPDATE ... SET state='leased' WHERE id = (SELECT ...)` inside a transaction, with a stale-lease reclaim after 10 minutes).

For a `start_run` job, build the command:

```
claude -p "<prompt>"
  --output-format stream-json
  --verbose
  --include-partial-messages
  --model <step.model>
  --effort <step.effort>
  --permission-mode <step.permission_mode>
  --session-id <generated uuid, stored as runs.claude_session_id>
  --mcp-config <generated per-run mcp.json>
  --strict-mcp-config
  --add-dir <each installed skill's install_path>
  [--allowedTools ...]  [--max-turns N]  [--max-budget-usd N]
  [--append-system-prompt <agent.system_prompt, for kind='agent'>]
```

Run with `cwd` set to the task's worktree path. `--strict-mcp-config` is important: it stops my personal MCP config leaking into runs and keeps them reproducible.

**Prompt construction.** The prompt is assembled from, in order:
1. A short preamble naming the task, its title and body.
2. A list of input artifacts with their absolute paths, one per `requires` entry, phrased as "read these first".
3. The exact output path the step should write, one per `produces` entry.
4. For `kind='skill'`: the slash invocation, e.g. `/grill-me`.
5. The step's `prompt_template` with `{{task_title}}`, `{{task_body}}`, `{{artifact:<type>}}` and `{{worktree}}` substituted.
6. A closing instruction: this is a headless run, there is no terminal to ask into — use the `ask_user` MCP tool for any question.

That last line matters. A headless agent that ends with "let me know if you also want tests" is a stuck run.

**Event handling.** Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`, and push onto an in-memory per-run emitter that the SSE endpoint subscribes to. Normalise each event into one of the `type` values in the schema and produce a one-line `summary` for the viewer (e.g. `Read src/auth/session.ts`, `Bash: pnpm test`).

**Cost.** Take the final result event's total cost as authoritative for `runs.cost_usd`. Accumulate per-message token usage as you stream so the live view shows a running number before the run ends. Verify the actual field names against your `docs/stream-sample.jsonl` probe.

**Completion.** On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8. On non-zero exit, set `failed`, record stderr in `runs.error`, and put the task into `blocked` rather than retrying automatically.

**Sandboxed runs.** When the step's sandbox tier is not `host`, the runner does not spawn `claude` directly; it launches the command *inside* the task's container (worktree bind-mounted as `cwd`) through the execution host and streams the same stdout. `bypassPermissions` is rejected unless the tier is a sandbox. See §11.1 and `docs/architecture/08-sandboxing.md`.

---

## 8. Advancement rules

After a run succeeds:

- If the step has `advance_mode='approval'`, set the step instance to `awaiting_approval` and stop. It advances only when I click Approve.
- If the step has unanswered required questions, set `awaiting_answers` and stop.
- Otherwise mark it `done` and enqueue `advance_task`.

`advance_task` resolves outgoing edges from the completed step definition:

- `always` edges always fire.
- `on_pass` / `on_fail` edges fire based on `step_instances.outcome`. A step sets its outcome by writing `{"outcome":"pass"|"fail"}` into its artifact JSON, or via the `set_outcome` MCP tool. Default to `pass` if unset.
- If more than one edge fires, create all the target step instances and start them concurrently. This is the fan-out.
- A step definition with multiple incoming edges is a join: it starts only once every upstream step instance for this task is `done`.

Rework loops: an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run. Mark the superseded runs `wasted = 1` so the cost view can report discarded spend. At `max_attempts`, fail the task.

---

## 9. The ask-user MCP server

`mcp/ask-user.ts` is a stdio MCP server. The runner writes a per-run `mcp.json` pointing at it and passes `TASK_ID`, `STEP_INSTANCE_ID` and `RUN_ID` as environment variables. It opens the same SQLite file.

Four tools:

**`ask_user_batch(questions[])`** — the preferred path. Inserts all questions with a shared `batch_id` and blocks until every required one is answered. Each question: `{ id, prompt, help?, kind, options?, required? }`. Returns `{ answers: { [id]: value } }`.

**`ask_user(question)`** — single adaptive question, same blocking semantics.

**`declare_artifact({ type, path })`** — registers an artifact.

**`set_outcome({ outcome, reason })`** — sets `pass` or `fail` for conditional edges. Code review calls this.

**Blocking and parking.** The tools poll the `questions` table every 2 seconds. After 20 minutes with no answer, return a sentinel instead of hanging forever:

```json
{ "status": "no_answer_yet",
  "instruction": "Write your current state to <artifact path> and end your turn. You will be resumed with the answers." }
```

The runner sees the process exit, sets the run to `parked`, and leaves the step instance in `awaiting_answers`. When the last required answer arrives, enqueue a new `start_run` that resumes with `--resume <claude_session_id> --fork-session` and a prompt containing the answers. This is more robust than trying to hold a session alive for hours.

**Prefer batching.** Structure `/grill-me` and similar skills to emit their whole question set at once via `ask_user_batch`. Answering seven questions in one screen is better than a drip feed, and it avoids the blocking problem entirely for most steps.

---

## 10. Questions inbox and Slack escalation

**Inbox page (`/inbox`)** — the most important screen in the app. Every pending question across all projects, newest-blocking-first. Group by task. Render the control that matches `kind`:

| kind | control |
|---|---|
| `yes_no` | two shadcn Buttons, Yes / No |
| `single_select` | RadioGroup, or Buttons if ≤3 short options |
| `multi_select` | Checkbox list with a Submit button |
| `text` | Textarea, Cmd+Enter to submit |
| `number` | Input type=number |

Show, per question: task title, step name, how long it has been waiting, and a link to the live session. Keyboard navigation: `j`/`k` to move between questions, `1`-`9` to pick an option, `Enter` to submit. Make answering fast — this is the screen I will spend the most time on.

**Escalation.** When a question is inserted, enqueue an `escalate_question` job with `run_after = now + 5 minutes`. If the question is still `pending` when the job runs, post to Slack via `chat.postMessage` using Block Kit:

- `yes_no` and `single_select` → an `actions` block of buttons, one per option
- `multi_select` → a `multi_static_select`
- `text` and `number` → a button that opens a modal with a `plain_text_input`

Store `slack_channel` and `slack_ts`. Handle interactions at `POST /api/slack/interactions` (verify the signing secret).

Two correctness requirements:
- **Idempotent answers.** First write wins. If the question is already `answered`, the second submitter gets "already answered by <channel>".
- **Reconciliation.** Answering in Slack must update the open web page (the inbox subscribes to an SSE stream). Answering on the web must repaint the Slack message via `chat.update` to show it is resolved and by whom.

Slack config (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID`) lives in `.env.local`. If the token is absent, log the escalation and carry on — Slack is optional.

Include the task title and question text in the Slack message, but not artifact bodies or file contents.

---

## 11. Git worktrees

Every task gets its own worktree so parallel steps cannot collide on the filesystem. On promotion from Backlog to Todo:

```
git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>
```

Store both paths on the task. All runs for that task use it as `cwd`. When a task reaches `done` or `cancelled`, offer a "clean up worktree" action; never remove it automatically.

Parallel steps within one task share the task's worktree. If two concurrent steps both write code they will conflict — so the seeded default flow puts the test-writing agent on the same worktree but scoped to `tests/` via its prompt and `allowedTools`. Note this limitation in the README as a known constraint.

### 11.1 Sandboxed execution (optional, recommended for headless runs)

Every step runs with `permission_mode='bypassPermissions'` by default — a fully-autonomous agent that reads untrusted content (repo files, the backlog, web pages, prior artifacts). Running that directly on the host is the dangerous configuration. Optionally run each step inside a **container** (or, for untrusted repos, a gVisor/microVM) instead of a host process. The task's worktree is bind-mounted as the working directory; nothing else from the host is mounted.

The container applies a **security profile**: default-deny **network egress** with an allowlist (the `claude` CLI's model endpoint, the package registries a build needs, and the project's git remote), a non-root user, `--cap-drop ALL`, `--security-opt no-new-privileges`, a read-only root filesystem with `tmpfs` scratch, and resource limits (`--memory`, `--cpus`, `--pids-limit`, wall-clock) that physically backstop the logical `max_turns`/`max_budget_usd` caps. Containers are ephemeral — one per run, destroyed on completion.

**Egress restriction is the load-bearing control:** it holds even though `bypassPermissions` is on, because it is enforced below the agent's reasoning. Therefore **`bypassPermissions` is only allowed when the step runs in a sandbox tier.** On the host tier, refuse it (or downgrade to an approval mode).

Because the agent runs with `cwd` inside the container, no host mounts, and restricted egress, the `ask_user` MCP server cannot open the host SQLite file. Use the artifact-file park/resume path (§9 — the agent writes `questions.json` and parks; the host watches the produced path), or expose a host-side `ask_user` broker over a bind-mounted unix socket. Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket; pass model/CLI auth as run-scoped env.

Configuration: a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step; `runs.sandbox` records the tier that actually ran, alongside `runs.model`/`runs.effort`. Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`. Full threat model, isolation ladder, and prior art (Claude Code's dev-container firewall, Codex's default OS sandbox, gVisor/Firecracker): `docs/architecture/08-sandboxing.md`.

---

## 12. API surface

REST route handlers under `src/app/api/`. All handlers are thin: validate with zod, call a function in `src/lib/`, return JSON.

```
GET    /api/projects                       POST /api/projects
GET    /api/projects/:id/board              -- board projection: columns + cards
GET    /api/flows/:id                       PUT  /api/flows/:id   -- creates a new version
POST   /api/flows/:id/validate              -- artifact contract check
GET    /api/tasks?project=&status=          POST /api/tasks
POST   /api/tasks/:id/promote               -- backlog -> todo, pin flow, create worktree
POST   /api/tasks/:id/cancel
POST   /api/step-instances/:id/approve      POST /api/step-instances/:id/reject
POST   /api/step-instances/:id/retry
GET    /api/questions?state=pending         POST /api/questions/:id/answer
GET    /api/runs/:id                        GET  /api/runs/:id/stream   -- SSE
GET    /api/skills                          POST /api/skills/install    -- from github url
GET    /api/agents                          POST /api/agents
POST   /api/import/backlog                  -- md file -> tasks
GET    /api/costs?project=&from=&to=
POST   /api/slack/interactions
```

The SSE endpoint replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`.

---

## 13. UI

Dark-first, dense, keyboard-friendly. Use shadcn defaults; do not build a design system.

**`/` — projects list.** Cards with task counts by status and this week's spend.

**`/p/[slug]` — the board.** Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`. Each card shows title, current step, a state dot (running / awaiting answers / awaiting approval / failed), a live cost figure, and a split badge when parallel branches are active. Drag is enabled only between Backlog and Todo — everything downstream is driven by the engine, and dragging there would lie about what the system does. Clicking a card opens a detail sheet.

**Task detail sheet.** Timeline of step instances with state, attempts, cost and duration. Artifacts listed as links that open a rendered markdown viewer. Approve / Reject buttons on the step that is awaiting approval. A diff view between `plan.md` and `summary.md` when both exist — this is the "compare what was planned with what was built" payoff.

**`/inbox` — questions.** As specified in §10.

**`/runs/[id]` — live session viewer.** Streams the normalised event summaries as they arrive, with tool calls collapsible to show their full input and result. Sticky footer with elapsed time, turn count, running cost. A Stop button that kills the process.

**`/p/[slug]/flow` — flow editor.** A node graph is nice but not required for v1. A vertical list of steps with an "add step" button and a connections panel is acceptable and much faster to build. When adding a step: choose Skill or Agent, pick from installed skills or defined agents, then set model, effort, advance mode, requires, produces, and limits. Show a live validation banner when the artifact contract is unsatisfied.

**`/skills` and `/agents`.** Skills: list installed, install from a GitHub URL (clone or sparse-checkout into `./skills/<slug>`, parse `SKILL.md` frontmatter for name and description), update, remove. Agents: a form for name, description, system prompt, default model, default effort, allowed tools.

**`/costs`.** Not just a total. Show:
- spend per project over time (bar chart, Recharts)
- spend per step definition, so I can see what `/grill-me` actually costs me
- spend per model and effort combination
- **wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops
- cost per completed task, trended by flow version

Add a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`, for when I am iterating on the flow itself rather than on code.

Add a **sandbox** section in settings too: the default isolation tier (host / container / microVM), the container image, the network egress allowlist, and the resource limits. See §11.1.

---

## 14. Build order

Commit after each milestone.

**M1 — Foundation.** Next.js + Tailwind + shadcn + Drizzle + schema + migrations. Seed a project pointing at a scratch git repo. Projects list page renders.

**M2 — Tasks and board, no automation.** Create tasks manually. Board renders columns from a hardcoded flow. Promote Backlog → Todo creates a worktree. No agents run yet.

**M3 — The runner.** Worker process, job queue, spawn `claude -p` for one hardcoded step, parse stream-json into `run_events`, SSE session viewer, cost captured on the run. **This is the milestone that proves the whole idea.** Do not proceed until you can watch a real session stream in the browser and see its cost land in the database.

**M4 — The question loop.** MCP server with `ask_user_batch`, blocking with the 20-minute sentinel, inbox page with all five control types, park-and-resume. Verify end to end with a trivial skill that asks three questions of different kinds.

**M5 — Flow engine.** Step defs, edges, fan-out, joins, conditional edges, approval gates, rework loops with `max_attempts`, artifact contract validation.

**M6 — Slack escalation.** 5-minute timer, Block Kit rendering, interaction handler, idempotency and reconciliation both directions.

**M7 — Library and import.** Skills install from GitHub, agent CRUD, markdown backlog import.

**M8 — Cost views and flow editor UI.**

---

## 15. Seed data

Seed one project and one flow that reproduces my actual workflow. Steps, in order, with edges:

| key | name | kind | model | effort | advance | requires | produces |
|---|---|---|---|---|---|---|---|
| `research` | Research | agent `researcher` | sonnet | medium | auto | — | `research_brief` |
| `grill` | Grill me | skill `/grill-me` | sonnet | medium | auto | `research_brief` | `questions`, `answers` |
| `plan` | Plan | agent `planner` | opus | high | auto | `research_brief`, `answers` | `plan` |
| `explain` | Explain plan | skill `/explain-simply` | haiku | low | **approval** | `plan` | `explainer` |
| `implement` | Implement | skill `/ponytail` | opus | high | auto | `plan` | `implementation_notes` |
| `tests` | Write tests | agent `test-writer` | sonnet | high | auto | `plan` | `test_notes` |
| `review` | Code review | skill `/code-review` | opus | high | **approval** | `implementation_notes`, `test_notes` | `review` |
| `summarize` | Summarize built | agent `summarizer` | sonnet | medium | auto | `review` | `summary` |

Edges: `research → grill → plan → explain`. Then `explain → implement` and `explain → tests` (the fan-out). Then `implement → review` and `tests → review` (the join). Then `review → summarize` on `on_pass`, and `review → implement` on `on_fail` (the rework loop).

Also seed a builtin agent **`backlog-importer`** whose job is: given a markdown file path, produce a JSON array of `{ import_key, title, body }`. Derive `import_key` from front-matter `id` if present, otherwise a slug of the heading. The import endpoint upserts on `(project_id, import_key)` so re-importing an edited file updates existing tasks instead of duplicating them.

Write the seeded skills as real local skill directories under `./skills/` with a `SKILL.md` each, so M4 and M5 are testable without any GitHub access. They can be short.

---

## 16. Acceptance checklist

When you are done, all of these must be true:

- [ ] `pnpm dev` starts Next.js and the worker together
- [ ] Importing a markdown backlog twice produces no duplicates and picks up edits
- [ ] Promoting a task creates a git worktree on its own branch
- [ ] A step runs, streams live to `/runs/[id]`, and records a non-zero cost
- [ ] `/grill-me` asks a batch of questions that appear in `/inbox` with correct controls per kind
- [ ] Leaving a question for 5 minutes posts it to Slack; answering in Slack updates the web UI live, and vice versa
- [ ] A question left for 20 minutes parks the run; answering resumes it with the answers in context
- [ ] `explain` and `review` stop and wait for my approval; the rest advance automatically
- [ ] `implement` and `tests` start at the same time and `review` waits for both
- [ ] Rejecting a review sends the task back to `implement` as attempt 2, and three failed attempts fail the task
- [ ] Saving a flow whose step requires an artifact nobody produces is rejected with a readable error
- [ ] The task detail sheet diffs `plan.md` against `summary.md`
- [ ] `/costs` shows spend per step definition and a separate wasted-spend figure
- [ ] Draft mode forces every step to haiku/low

## 17. Out of scope

Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI.

Note on Docker: shipping or *deploying* FlowBoard itself in a container is out of scope. **Sandboxing agent execution** in a container/microVM (§11.1) is in scope but optional — it isolates the agent on the same single machine; it is not multi-tenancy or remote execution.