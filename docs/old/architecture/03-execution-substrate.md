# 03 — Execution substrate

How runs actually happen: the swappable provider (5), the generic loop that drives it (6), the queue that
leases work (7), and the stream that shows it live (8). Components 6–8 contain **zero provider strings** once
5 is extracted — that is the test of the abstraction.

← back to [README](./README.md) · ports: [01](./01-ports.md)

---

## 5. AgentProvider abstraction ⭐

- **Role:** turn "run an agent" into the normalized contract in [`01-ports.md`](./01-ports.md#agentprovider);
  Claude Code, Codex, and `ReplayProvider` are adapters.
- **Seam:** the adapter maps `RunSpec` → native flags and parses the native stream → `NormalizedEvent`.
  For Claude: `--output-format stream-json --verbose --include-partial-messages --effort --session-id
  --mcp-config --strict-mcp-config --plugin-dir --resume --fork-session`. For Codex: its own equivalents.
  All of that lives *inside the adapter*.
- **Genericize:** every Claude-specific fix the backlog lists moves **into the Claude adapter**, out of the
  runner — this is the whole payoff:
  - `--plugin-dir` registers `/slug`; `--add-dir` does not.
  - `message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas.
  - Capture `session_id` once from `system/init`, not every line.
  - `total_cost_usd` authoritative → maps to `Usage.costUsd`; Codex leaves it absent for PricingService.
  - Always append `mcp__vibe__*` to `--allowedTools` so a restrictive list can't lock out `ask_user`.
- **Composes with:** the runner (6) is the generic half that consumes this port; HITL (4), cost (6), and the
  viewer (8) all consume its normalized outputs.
- **Idea:** `ReplayProvider` (see [01](./01-ports.md#replayprovider)) makes the entire substrate testable with
  no spend and deterministic timing.

## 6. Runner / execution host

- **Role:** the generic execution loop — build `RunSpec`, `launch()` via the port, tee events to `run_events`
  + the SSE emitter, scan artifacts on completion, apply the engine's advancement rules.
- **Seam:** provider-neutral end to end. Prompt assembly is the fixed 6 parts (PRD §7): preamble → input
  artifact paths ("read these first") → output paths → skill invocation → `prompt_template` with
  `{{task_title}} {{task_body}} {{acceptance_criteria}} {{non_goals}} {{artifact:<type>}} {{worktree}}` → closing
  headless instruction ("no terminal; use `ask_user`"). The preamble carries the task's acceptance criteria and
  non-goals, so the contract is fixed before generation. Artifact scan = mtime ≥ run start, matched to
  `produces`; outcome read from the produced JSON (`{"outcome": …}`). **No default:** an unset outcome on a step
  with conditional edges goes to a human gate, never to `pass` (PRD §8).
- **Shell steps are the sensors.** A `kind='shell'` step runs `command` (or the project's `check_command`)
  through the same `ExecHost`, so it is sandboxed like any agent. Its exit code *is* the outcome and its
  output tail is a `check_output` artifact. The model proposes; the harness runs the check; the exit code
  decides. No `AgentProvider` is involved, and the run costs nothing.
- **Genericize:** the resume prompt must repeat the requires/produces paths, not only the answers (backlog
  bug). Draft mode is applied here as a `RunSpec` transformer
  ([15](./06-cost-and-platform.md#15-settings-draft-mode-api)) and the *actual* model/effort recorded on the run.
- **Sandbox:** the runner gets an `ExecHost` from `workspace.execHost(task)`
  ([08](./08-sandboxing.md)) and puts it on the `RunSpec`; the provider spawns the CLI *through* it, so any
  provider runs sandboxed unchanged. It **refuses `bypassPermissions` unless the tier is a sandbox**
  (container/microVM), downgrading to an approval/auto mode on the `host` tier; and maps the logical
  `max_turns` / `max_budget_usd` caps to the sandbox's physical `--memory` / `--cpus` / `--pids-limit` /
  wall-clock backstops.
- **Two gates, inside and outside.** Alongside `mcp.json` (which points at the `ask_user` shim on every tier) the
  runner writes a per-run `settings.json` with `PreToolUse` hooks: no writes outside the worktree, none to
  non-goal paths, no destructive git or shell commands (PRD §7). The sandbox limits what *can* happen; the hooks
  block what *shouldn't*. No real credential is passed in: the CLI's `ANTHROPIC_BASE_URL` points at the egress
  proxy, which injects it.
- **Memory (additive):** the runner brackets `launch()` with the [MemoryStore](./09-memory.md) port when it is
  enabled. **Before:** `recall({ scopes: user + project + agent + task, query })` and append the hits as a **7th
  prompt part** — background context, not instructions — truncated to `max_recall_chars` so recall can never
  become a context dump. **After a success:** `write()` the run's salient output,
  distilled from declared artifacts/answers only, so the adapter (Mem0) can extract facts and resolve
  contradictions. Both calls run **host-side** — the sandboxed agent never touches the store, so memory stays off
  the egress allowlist ([08](./08-sandboxing.md)). With the `none` adapter this is a no-op and nothing else
  changes — memory is additive, not on the critical path.
- **Infra retries are the runner's, not the engine's.** A non-zero agent exit is classified: transient (rate
  limit, overload, network, signal or lost on restart) → same attempt re-run, max 3, backoff 30 s / 2 m / 8 m,
  failed run `wasted=1`; anything else → `blocked`. The engine only ever sees work outcomes, so `max_attempts`
  counts work, not weather.
- **Composes with:** leased by the worker (7); calls the provider (5); writes instances/outcomes for the engine
  ([02 §3](./02-core-and-engine.md#3-flow-execution-engine-write-model)); feeds the viewer (8).
- **Idea:** snapshot the resolved `RunSpec` to `data/runs/<id>/spec.json`. Reproducibility becomes
  provider-independent — replay any run through `ReplayProvider` from its spec + captured events.

## 7. Job queue & worker lifecycle

- **Role:** SQLite-as-queue with leasing; restart recovery; concurrency cap `VIBE_MAX_RUNS`.
- **Seam:** `jobs` table + a lease transaction (`UPDATE … WHERE id=(SELECT … LIMIT 1) RETURNING`); stale-lease
  reclaim at 10 min; `attempts` / `last_error`. Provider-neutral already.
- **Genericize:** the worker is a **generic executor host** — nothing about it knows the provider. This is the
  decoupling point that later allows remote executors or a fleet without touching the core.
- **Composes with:** feeds the runner (6); the only writer of run lifecycle state.
- **Ideas / fixes (from the backlog, two real runs died here):**
  - `start_run` must not complete before the child spawns — a crash mid-spawn currently loses the run.
  - **Restart recovery: re-attach by pid before failing.** A `starting`/`running` row whose pid is alive →
    keep tailing; dead → fail with a Retry hint. Pid-liveness is OS-generic.
  - Graceful shutdown: SIGTERM children, mark runs `cancelled`, not `failed`.

## 8. Event stream & live viewer

- **Role:** normalized events → `run_events` → SSE tail (worker is a separate process) → `/runs/[id]`.
- **Seam:** the 7 `NormalizedEvent` kinds are the universal contract; SSE replays from `Last-Event-ID`, sends
  `end` on terminal state. The viewer never parses provider JSON.
- **Genericize:** done by construction once 5 emits `NormalizedEvent`. Adding a provider adds a parser, nothing
  in the viewer.
- **Composes with:** the runner (6) writes; SSE reads and tails `run_events` (deviation from PRD's in-memory
  emitter — keep it, the worker is a separate process).
- **Ideas / fixes (backlog):**
  - Dedupe by `seq` on append (StrictMode double-subscribe duplicates replay).
  - Sticky footer shows running cost estimated from tokens until `result` lands (needs incremental
    `num_turns`, see [02 §4](./02-core-and-engine.md#4-board-projection-read-model)).
  - Project link must use `slug`, not `id` (today 404s).
  - Stop = SIGTERM by pid from the route (same machine), finalize as `cancelled`.
