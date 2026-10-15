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

3. **That the CLI works through a credential-injecting proxy.** Run the probe above with `ANTHROPIC_BASE_URL` pointing at a local proxy that adds the real credential, and a dummy key in the environment (§11.1). If the CLI refuses, stop and tell me; the fallback is a short-lived, run-scoped token.

If any part of this spec turns out to be impossible or wrong given the actual CLI behaviour, stop and say so rather than silently substituting something else.

---

## 1. What this is

A local-first Kanban board where each column is an agent or skill invocation rather than a human workflow stage. A task enters the Backlog, gets promoted to Todo, and then flows through a graph of automated steps — research, planning, implementation, review — each one a headless Claude Code session with its own model and effort setting. Some steps advance automatically when they finish; others park and wait for me to approve or answer questions.

Single user, runs on my machine, no auth.

---

## 2. Stack

- **Next.js** (the current major when the build starts), App Router, TypeScript
- **SQLite** via `better-sqlite3`, with **Drizzle ORM** and drizzle-kit migrations
- **shadcn/ui** + Tailwind. Install components as needed; do not hand-roll anything shadcn provides
- **Server-Sent Events** for live streaming (not websockets — SSE is enough and simpler in Next.js)
- **A separate worker process** for running agents. Next.js route handlers must never spawn a long-lived child process; they enqueue jobs and the worker picks them up
- `concurrently` to run `next dev` and the worker together under `npm run dev`
- **No auth, no multi-tenancy, no user table.** Do not add them "for later"

Package manager: pnpm, as a workspace (§3).

---

## 3. Repository layout

A pnpm workspace. The one rule that matters: **`packages/core` imports no framework, no database driver and no CLI.** The engine, loop guard, advancement rules, prompt builder, fingerprinting and the port interfaces live there. Next.js is one shell around the core, not its home, so a later CLI, a different UI or remote workers reuse the same logic without a rewrite. Keep this rule from the first commit: it is cheap now and a rewrite later.

```
flowboard/
  packages/
    core/                   # framework-free; depends on nothing below
      engine/               # DAG traversal, advancement rules, loop guard (§8)
      prompt/               # the prompt parts (§7)
      ports/                # AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource interfaces
      events.ts             # NormalizedEvent, versioned (§7 "Events")
    db/                     # Drizzle schema, migrations, the db singleton
    adapters/
      agent/                # claude-cli, codex-cli (later), replay
      exec/                 # host, docker
      notify/               # slack
      memory/               # none, local
  apps/
    web/                    # Next.js: routes, server actions, SSE, components. Calls core; holds no rules
    worker/                 # job loop, runner, ask_user broker, escalation timer
    mcp-shim/               # tiny stdio MCP server; forwards to the broker over a unix socket (§9)
  seed/
    flows/default.json
  skills/
  data/
    flowboard.db
  drizzle.config.ts
```

Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does (§9). Enable WAL mode (`PRAGMA journal_mode = WAL`) so concurrent readers and writers do not block each other. Set `PRAGMA busy_timeout = 5000`.

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
- **Loops are guarded.** Any step instance that reaches `max_attempts` (default 3) stops looping and hands the task to me with the last error, rather than retrying again or failing silently (§8).

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
  check_command TEXT,                   -- e.g. 'pnpm lint && pnpm test'; what a shell check step runs
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
  kind           TEXT NOT NULL,          -- 'skill' | 'agent' | 'shell' | 'manual'
  command        TEXT,                   -- kind='shell' only; null = the project's check_command
  skill_id       TEXT REFERENCES skills(id),
  agent_id       TEXT REFERENCES agents(id),
  extra_plugin_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of plugins.id mounted alongside the skill's plugin
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
  acceptance_criteria TEXT,      -- the exact conditions that close the task; reviewed against
  non_goals     TEXT,            -- what the agents must not touch or attempt
  status        TEXT NOT NULL,   -- 'backlog'|'todo'|'running'|'blocked'|'done'|'failed'|'cancelled'
  import_key    TEXT,            -- stable key for idempotent md import
  branch_name   TEXT,
  worktree_path TEXT,
  capability_pins TEXT,          -- JSON {plugins:{id:commit_sha}, agents:{id:<agent row>}}, set when the task starts
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
  wasted            INTEGER NOT NULL DEFAULT 0,  -- 1 if superseded by a rework loop or an infra retry
  fingerprint       TEXT,           -- shell steps: normalized hash of a failing check_output (§8)
  error             TEXT,
  started_at        INTEGER,
  ended_at          INTEGER
);

CREATE TABLE run_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  v          INTEGER NOT NULL DEFAULT 1,  -- NormalizedEvent schema version (§7 "Events")
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

CREATE TABLE plugins (                -- the unit of install, update and remove
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,          -- plugin.json name, else the repo name
  source        TEXT NOT NULL,          -- 'seed'|'git'
  repo_url      TEXT,                   -- any git URL, incl. file://; null for seeds
  commit_sha    TEXT NOT NULL,          -- installed commit; seeds: FlowBoard's commit
  has_mcp       INTEGER NOT NULL,       -- ships .mcp.json (marked as network-capable)
  has_hooks     INTEGER NOT NULL,       -- ships hooks/ (marked as network-capable)
  installed_at  INTEGER NOT NULL,
  UNIQUE (project_id, name)
);
-- The plugin dir is derived, not stored: <repo_path>/.flowboard/skills/<name>/<commit_sha>/

CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  plugin_id     TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,          -- invoked as /<plugin.name>:<slug>, e.g. '/grill-me:grill-me'
  description   TEXT,
  allowed_tools TEXT,                   -- JSON array, from SKILL.md; SKILL.md itself is read from disk
  UNIQUE (plugin_id, slug)
);

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL,
  default_model  TEXT NOT NULL DEFAULT 'sonnet',  -- a Claude alias, used as the logical model id
  default_effort TEXT NOT NULL DEFAULT 'medium',
  allowed_tools  TEXT,                  -- JSON array
  is_builtin     INTEGER NOT NULL DEFAULT 0,   -- seeded: read-only, "Duplicate to edit" makes a copy
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (project_id, slug)
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

Seed these artifact types: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary`.

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
  --settings <generated per-run settings.json with PreToolUse hooks>
  --strict-mcp-config
  --plugin-dir <dir of each plugin the step names: its skill's plugin + extra_plugin_ids>
  [--allowedTools ...]  [--max-turns N]  [--max-budget-usd N]
  [--append-system-prompt <agent.system_prompt, for kind='agent'>]
```

Run with `cwd` set to the task's worktree path. `--strict-mcp-config` is important: it stops my personal MCP config leaking into runs and keeps them reproducible.

Use `--plugin-dir`, not `--add-dir`: only `--plugin-dir` registers a plugin's skills; `--add-dir` merely grants file access. Mount only the plugins the step names, never every installed one: plugins are mounted as-is, hooks and MCP servers included, so they should run only where a step asked for them. Each plugin dir is the commit recorded in the task's `capability_pins`, not the currently installed one, so an update never reaches a running task; agent rows are pinned the same way. When `--allowedTools` is set, always append `mcp__vibe__*` so a restrictive list cannot lock out `ask_user`. Snapshot the final args to `data/runs/<id>/args.json`.

**In-agent gate (hooks).** The per-run `settings.json` registers Claude Code `PreToolUse` hooks. They are the second mechanical gate: the sandbox limits what *can* happen, and the hooks block what *shouldn't*. The hook denies:
- writes outside the task's worktree;
- any path matching a line of the task's `non_goals` that is written as a path or glob;
- destructive commands: `rm -rf` outside the worktree, any `git push`, `git reset --hard` or `git checkout` of the base branch, and piping a download into a shell.

A denial returns its reason to the agent, so it changes course instead of stalling. The prompt states the same rules; the hook enforces them. Hooks are a provider capability (`tool_hooks`): a provider without them relies on the sandbox alone, and the flow editor says so.

**Prompt construction.** The prompt is assembled from, in order:
1. A short preamble naming the task, its title and body, its acceptance criteria ("the task is done when…") and its non-goals ("do not touch…"). Omit a heading when its field is empty.
2. A list of input artifacts with their absolute paths, one per `requires` entry, phrased as "read these first".
3. The exact output path the step should write, one per `produces` entry.
4. For `kind='skill'`: the slash invocation, fully qualified as `/<plugin>:<slug>`, e.g. `/grill-me:grill-me`. Claude Code namespaces plugin skills, so two plugins may ship the same slug.
5. The step's `prompt_template` with `{{task_title}}`, `{{task_body}}`, `{{acceptance_criteria}}`, `{{non_goals}}`, `{{artifact:<type>}}` and `{{worktree}}` substituted.
6. A closing instruction: this is a headless run, there is no terminal to ask into — use the `ask_user` MCP tool for any question.

That last line matters. A headless agent that ends with "let me know if you also want tests" is a stuck run.

When the memory layer is enabled (§11.2), a **seventh part** is inserted just before the closing instruction: a short "context you've learned before" block from `MemoryStore.recall`, scoped to *user + project + agent + task*, labelled as background rather than instructions. Part 7 has a hard size cap (`settings.memory.max_recall_chars`, default 6,000 — roughly 1,500 tokens): hits are ranked by relevance and the tail is dropped to fit. It never grows the other six parts. With memory off (`none`), the prompt is exactly the six parts above.

**Events are a versioned contract.** `NormalizedEvent` (in `packages/core`) is what every screen, the cost ledger and the engine read, so it is versioned: each event carries `v`, starting at 1. A reader handles the versions it knows and falls back to the raw line for the rest. Name fields after the OpenTelemetry GenAI semantic conventions where one exists (model, input and output tokens, tool name), so a tracing backend such as Langfuse can be fed later by a plain OTel exporter instead of a FlowBoard-specific bridge.

**Event handling.** Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`, The SSE endpoint lives in `apps/web`, a different process, so it cannot share an in-memory emitter: it tails `run_events` by `seq` (with `Last-Event-ID` for catch-up). Normalise each event into one of the `type` values in the schema and produce a one-line `summary` for the viewer (e.g. `Read src/auth/session.ts`, `Bash: pnpm test`).

**Cost.** Take the final result event's total cost as authoritative for `runs.cost_usd`. Accumulate per-message token usage as you stream so the live view shows a running number before the run ends. Verify the actual field names against your `docs/stream-sample.jsonl` probe.

**Shell steps.** A `kind='shell'` step runs no model. The runner executes `step.command` (or the project's `check_command`) in the task's worktree through the same execution host, so it inherits the sandbox. It writes stdout and stderr (tail, ~20 kB) to a `check_output` artifact. The **exit code is the outcome**: 0 sets `pass`, anything else sets `fail`. A non-zero exit here is a result, not a run failure, so it follows the step's edges instead of blocking the task. Shell runs cost nothing and record `cost_usd = 0`.

**Completion.** On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8. On non-zero exit, set `failed` and record stderr in `runs.error`. A non-zero exit from an agent run is an **infrastructure failure**, never a verdict on the work, because work verdicts arrive as outcomes. Classify it:
- **Transient** (rate limited, overloaded, network error, process killed by a signal or lost on restart): retry the same attempt automatically, up to 3 times, with backoff of 30 s, 2 min and 8 min. It is a new run with the same `attempt` number. The failed run is marked `wasted = 1` and does **not** count toward `max_attempts`.
- **Anything else**, or a 4th transient failure (budget or turn cap hit, auth error, bad config, unknown): put the task into `blocked`, as before. Retrying these would only burn the same money again. When the memory layer is enabled, after a success the runner also `write()`s the run's salient output (declared artifacts + answers) to `MemoryStore` (§11.2).

**Sandboxed runs.** When the step's sandbox tier is not `host`, the runner does not spawn `claude` directly; it launches the command *inside* the task's container (worktree bind-mounted as `cwd`) through the execution host and streams the same stdout. `bypassPermissions` is rejected unless the tier is a sandbox. See §11.1 and `docs/architecture/08-sandboxing.md`.

---

## 8. Advancement rules

After a run succeeds:

- If the step has `advance_mode='approval'`, set the step instance to `awaiting_approval` and stop. It advances only when I click Approve.
- If the step has unanswered required questions, set `awaiting_answers` and stop.
- Otherwise mark it `done` and enqueue `advance_task`.

`advance_task` resolves outgoing edges from the completed step definition:

- `always` edges always fire.
- `on_pass` / `on_fail` edges fire based on `step_instances.outcome`. A shell step's outcome is its exit code. An agent step sets its outcome by writing `{"outcome":"pass"|"fail"}` into its artifact JSON, or via the `set_outcome` MCP tool.
- **A missing outcome is never a pass.** If the step has an `on_pass` or `on_fail` edge and the run ended without setting an outcome, set the step instance to `awaiting_approval` with the reason "no outcome reported" and stop. I decide; approve means pass, reject means fail. Steps with only `always` edges need no outcome.
- If more than one edge fires, create all the target step instances and start them concurrently. This is the fan-out.
- A step definition with multiple incoming edges is a join: it starts only once every upstream step instance for this task is `done`.

Rework loops: an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run. The counter lives on the **target** instance, so every loop that sends work back to the same step shares one budget. In the seeded flow, a failed `check` and a failed `review` both spend `implement`'s attempts. The new run's "read these first" list (prompt part 2) also gets the artifacts the failing step produced, so a rework sees the raw `check_output` or `review`, not a summary of it. Mark the superseded runs `wasted = 1` so the cost view can report discarded spend.

**`max_attempts` counts total runs of the step, first try included** (infra retries excluded). The default of 3 means one try and two automatic redos.

**Escalate, don't fail, when a loop is spent or stuck.** Escalate in either of two cases. First, when a rework edge would start a run past `max_attempts`. Second, when a shell step fails with the **same fingerprint** as its previous failed run, because the redo changed nothing. Either way, start nothing. Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate. I choose: **Retry** grants one more attempt and carries my note into it, like a rejection reason. It does not reset the counter. **Fail task** ends it.

**Fingerprint.** For a failing shell step, take the last 20 non-empty lines of its output. Strip digits, hex ids, absolute paths and timestamps, then hash the result. Store it on `runs.fingerprint`. Fewer failing tests or a different error gives a different fingerprint, and the loop continues. Review failures get no fingerprint: model output varies too much to compare, so the review loop is bounded by `max_attempts` alone.

---

## 9. The ask-user MCP server

Questions take **one path on every tier**, host or sandbox. It has two halves:

- The **broker** runs inside the worker. It is the only writer of the `questions` table. For each run it opens a unix socket, `data/sock/<run_id>.sock`, which is bind-mounted into a sandbox as `/run/fb/ask.sock`.
- The **shim**, `apps/mcp-shim`, is a tiny stdio MCP server that the CLI launches. The runner writes a per-run `mcp.json` pointing at it and passes `RUN_ID` and the socket path as environment variables. The shim forwards each tool call over the socket and relays the reply. It never opens the database and needs no network.

So a host run and a sandboxed run behave identically, and there is one path to test. The artifact-file exchange ("Blocking and parking" below) remains the fallback for a provider without MCP.

Four tools:

**`ask_user_batch(questions[])`** — the preferred path. Inserts all questions with a shared `batch_id` and blocks until every required one is answered. Each question: `{ id, prompt, help?, kind, options?, required? }`. Returns `{ answers: { [id]: value } }`.

**`ask_user(question)`** — single adaptive question, same blocking semantics.

**`declare_artifact({ type, path })`** — registers an artifact.

**`set_outcome({ outcome, reason })`** — sets `pass` or `fail` for conditional edges. Code review calls this.

**Blocking and parking.** The broker polls the `questions` table every 2 seconds and holds the shim's call open. After 20 minutes with no answer, return a sentinel instead of hanging forever:

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

Every step runs with `permission_mode='bypassPermissions'` by default — a fully-autonomous agent that reads untrusted content (repo files, the backlog, web pages, prior artifacts). Running that directly on the host is the dangerous configuration. Optionally run each step inside a **container** (or, for untrusted repos, a gVisor/microVM) instead of a host process. The task's worktree is bind-mounted as the working directory; the only other mounts are the step's plugin dirs, read-only (§7).

The container applies a **security profile**: default-deny **network egress** with an allowlist (the model endpoint and the package registries a build needs; **not** the project's git remote, because the host does all git work and the agent never needs to push or fetch), a non-root user, `--cap-drop ALL`, `--security-opt no-new-privileges`, a read-only root filesystem with `tmpfs` scratch, and resource limits (`--memory`, `--cpus`, `--pids-limit`, wall-clock) that physically backstop the logical `max_turns`/`max_budget_usd` caps. Containers are ephemeral — one per run, destroyed on completion. Implement egress as a proxy (Squid or tinyproxy) on an internal-only Docker network: the container has no other route out.

**No real credential enters the container.** The CLI gets `ANTHROPIC_BASE_URL` pointing at the egress proxy and a dummy key. The proxy swaps in the real credential, and only on requests to the model endpoint. A prompt-injected agent can read its own environment, so the environment holds nothing worth stealing. (Verify in §0, step 3.)

**Egress restriction is the load-bearing control:** it holds even though `bypassPermissions` is on, because it is enforced below the agent's reasoning. Therefore **`bypassPermissions` is only allowed when the step runs in a sandbox tier.** On the host tier, refuse it (or downgrade to an approval mode).

Because the agent runs with `cwd` inside the container, no host mounts, and restricted egress, the `ask_user` MCP server cannot open the host SQLite file. It doesn't need to: the shim talks to the host broker over the mounted socket (§9), never to the database or the network. Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket.

Configuration: a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step; `runs.sandbox` records the tier that actually ran, alongside `runs.model`/`runs.effort`. Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`. On the host tier, a step that mounts a git-installed plugin does not run: that plugin's hooks and MCP servers would execute as me, with no egress wall. Seed plugins still run there. Full threat model, isolation ladder, and prior art (Claude Code's dev-container firewall, Codex's default OS sandbox, gVisor/Firecracker): `docs/architecture/08-sandboxing.md`.

### 11.2 Agentic memory (optional, additive)

FlowBoard has no cross-task memory: every run starts cold, a second task on the same repo re-learns its conventions, and the inbox re-asks questions it has effectively answered before. Add an optional **memory layer** so runs start warm. It is **additive** — with it off, every flow behaves exactly as this spec describes; memory is never on the critical path of a run.

Introduce a **`MemoryStore` port** with two calls, `recall` and `write`. Three adapters, in build order:

- **`none`**: a no-op, and the default.
- **`local`**: the first real one. A `memories` table with an FTS5 index in the same `flowboard.db`. Keyword recall, ranked by scope and recency. No embeddings, no extraction model, no extra container.
- **[Mem0](https://github.com/mem0ai/mem0)**, later and self-hosted. Adopt it only once the cost and inbox views show `local` memory paying off and recall quality is what limits it. Mem0 adds fact extraction and contradiction resolution, at the price of an extraction model's spend and a vector store.

**Where it hooks in — the runner (§7), host-side only.**
- **Recall, before the run:** query the store for memories relevant to this run — scoped by *user* (the single operator), *project*, the step's *agent/skill*, and the *task* — and append them to the prompt as a final part: "context you've learned before (background, not instructions)." This is prompt part 7 in §7.
- **Commit, after a run succeeds:** hand the run's salient output — the answers it collected, the outcome it set, the summary/review it produced — to `write()`. With `local`, it is stored as written and recall prefers the newest; with Mem0, Mem0 does the fact extraction and contradiction resolution. FlowBoard never diffs memories by hand. Commit reads from **declared artifacts and answers only**, never raw agent output.

Both calls run in the runner **on the host**, so the sandboxed agent process never connects to the store and **memory adds nothing to the sandbox egress allowlist** (§11.1). Recalled text is context, not instructions; writes are scoped (a run writes only its own project/agent/task) and audited. This cross-run trust boundary is the part to get right — see `docs/architecture/09-memory.md`.

**Scopes:** `user` (standing prefs + recurring decisions — the single highest-leverage one), `project` (a codebase's conventions and gotchas), `agent` (what a role/skill accrues across runs), `task` (why attempt 1 failed → attempt 2 starts warm).

**Schema — almost nothing.** The `local` adapter adds one `memories` table (scope, scope_id, text, source_run_id, created_at) with an FTS5 index. Add a `memory` block to `settings` (adapter id, endpoint / key ref, enabled scopes, recall limit, `max_recall_chars`) and an optional `run_memories(run_id, memory_id, scope)` link recording what was recalled into each run, for the audit trail. With Mem0, Mem0 owns the memories and none of their content is duplicated into SQLite. Tag memory-layer token/API cost separately so it never lands in the per-run cost rollups (§13) — the point of memory is to *lower* run cost, and the ledger must be able to show the net.

Full design, scope mapping, and trust boundary: `docs/architecture/09-memory.md`.

---

## 12. API surface

REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON.

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
GET    /api/projects/:id/library            -- plugins + skills + agents, with used-by
POST   /api/projects/:id/plugins/preview    -- {url}: clone to staging, parse, return what was found
POST   /api/projects/:id/plugins            -- {previewId}: confirm the install
POST   /api/projects/:id/plugins/check-updates
POST   /api/plugins/:id/update/preview      POST /api/plugins/:id/update   -- 409 if it drops an in-use skill
DELETE /api/plugins/:id                     -- 409 while in use
POST   /api/projects/:id/agents             PATCH /api/agents/:id   DELETE /api/agents/:id
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

**`/p/[slug]/library` — skills and agents.** One screen per project. Plugins: install from any git URL (GitHub or `file://`), cloned into `<repo_path>/.flowboard/skills/<plugin>/<commit>/` (gitignored, one dir per commit) after a preview of what was found; a plugin is installed, updated and removed as one unit with all its skills. **Check for updates** is manual; an update first previews the skills it adds and removes and is refused if it drops one a step uses. Remove asks for confirmation and is disabled while any step uses the plugin (counting each flow's latest version and any version a running task pins). Mark plugins that ship `.mcp.json` or `hooks/`, and skills that ask for `Bash`, `WebFetch` or `WebSearch`, as network-capable. Agents: a form for name, description, system prompt, default model, default effort, allowed tools; seeded agents are read-only, with a Duplicate to edit action.

**`/costs`.** Not just a total. Show:
- spend per project over time (bar chart, Recharts)
- spend per step definition, so I can see what `/grill-me` actually costs me
- spend per model and effort combination
- **wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops
- cost per completed task, trended by flow version

Add a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`, for when I am iterating on the flow itself rather than on code.

Add a **sandbox** section in settings too: the default isolation tier (host / container / microVM), the container image, the network egress allowlist, and the resource limits. See §11.1.

Add a **memory** section in settings as well (§11.2): the adapter (`none` / `local` / self-hosted Mem0 / Mem0 cloud), its endpoint or key ref, which scopes are enabled (user / project / agent / task), and the recall limit. Default the adapter to `none` — memory is additive, and nothing else in the app depends on it being on.

---

## 14. Build order

Commit after each milestone.

**M1 — Foundation.** Next.js + Tailwind + shadcn + Drizzle + schema + migrations. Seed a project pointing at a scratch git repo. Projects list page renders.

**M2 — Tasks and board, no automation.** Create tasks manually. Board renders columns from a hardcoded flow. Promote Backlog → Todo creates a worktree. No agents run yet.

**M3 — The runner.** Worker process, job queue, spawn `claude -p` for one hardcoded step, parse stream-json into `run_events`, SSE session viewer, cost captured on the run. **This is the milestone that proves the whole idea.** Do not proceed until you can watch a real session stream in the browser and see its cost land in the database.

**M4 — The question loop.** MCP server with `ask_user_batch`, blocking with the 20-minute sentinel, inbox page with all five control types, park-and-resume. Verify end to end with a trivial skill that asks three questions of different kinds.

**M5 — Flow engine.** Step defs, edges, fan-out, joins, conditional edges, approval gates, rework loops with `max_attempts` escalation, shell check steps, artifact contract validation. Proof it works: a deliberately failing test in the scratch repo sends the seeded flow from `check` back to `implement` with the raw log, and a run that sets no outcome stops at a gate instead of passing.

**M6 — Slack escalation.** 5-minute timer, Block Kit rendering, interaction handler, idempotency and reconciliation both directions.

**M7 — Library and import.** Skills install from GitHub, agent CRUD, markdown backlog import.

**M8 — Cost views and flow editor UI.**

**M9 — Memory (optional, additive).** The `MemoryStore` port with the `local` SQLite adapter and a `none` no-op (default); Mem0 is a later adapter behind the same port. Recall injects the seventh prompt part before a run; commit writes the run's declared artifacts + answers to the store after a success; both host-side. Off by default; ships last because it depends on runs, questions, and artifacts already existing. Proof it works: a preference answered once in the inbox is recalled into the next task and not asked again — and turning memory off returns the app to exactly its M1–M8 behaviour. See §11.2 and `docs/architecture/09-memory.md`.

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
| `check` | Lint & test | shell (project `check_command`) | — | — | auto | — | `check_output` |
| `review` | Code review | skill `/code-review` | opus | high | **approval** | `implementation_notes`, `test_notes`, `check_output` | `review` |
| `summarize` | Summarize built | agent `summarizer` | sonnet | medium | auto | `review` | `summary` |

Edges: `research → grill → plan → explain`. Then `explain → implement` and `explain → tests` (the fan-out). Then `implement → check` and `tests → check` (the join). Then `check → review` on `on_pass` and `check → implement` on `on_fail` (the mechanical loop: the model never gets reviewed on code that doesn't pass). Then `review → summarize` on `on_pass`, and `review → implement` on `on_fail` (the review loop). Seed the scratch project's `check_command` with something that exists in the scratch repo.

The seeded `/code-review` skill reviews the diff against the task's acceptance criteria and non-goals and against the raw `check_output`, and must call `set_outcome`. It is told to look for failures, not to confirm the work.

Also seed a builtin agent **`backlog-importer`** whose job is: given a markdown file path, produce a JSON array of `{ import_key, title, body, acceptance_criteria?, non_goals? }` (the last two from "Acceptance criteria" / "Non-goals" sub-sections when present). Derive `import_key` from front-matter `id` if present, otherwise a slug of the heading. The import endpoint upserts on `(project_id, import_key)` so re-importing an edited file updates existing tasks instead of duplicating them.

Write the seeded skills as real local plugin dirs under FlowBoard's `./skills/` with a `SKILL.md` each, so M4 and M5 are testable without any GitHub access. They can be short. Registering a project copies the seeds into its store under FlowBoard's commit; upgrading FlowBoard stages new seed commits as an available update rather than applying them.

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
- [ ] With memory enabled, a preference answered in the inbox is recalled into the next task's run and not asked again
- [ ] With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition
- [ ] Recall and commit happen host-side; a sandboxed run needs no egress-allowlist entry for the memory store

## 17. Out of scope

Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI.

Note on Docker: shipping or *deploying* FlowBoard itself in a container is out of scope. **Sandboxing agent execution** in a container/microVM (§11.1) is in scope but optional — it isolates the agent on the same single machine; it is not multi-tenancy or remote execution.

Note on memory: the **agentic memory** layer (§11.2) is in scope but **additive and off by default**, and **self-hosted** — it keeps FlowBoard local-first. The Mem0 *managed cloud* platform is out of scope for v1; it is the later shared/remote tier, the same decision as a remote workspace. Memory must never become a precondition for a run: with the `none` adapter the app behaves exactly as the rest of this spec describes.