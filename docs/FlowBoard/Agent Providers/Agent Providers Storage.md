---
tags: [flowboard, agent-providers, storage]
module: Agent Providers
---

# Agent Providers Storage

> [!info] Design, not built
> The PRD's code layout, per-run files and database below do not exist on `dev` as of 2026-10-22. What exists is the package layout in the last column of *Code layout*, and one JSONL log per `run-agent` run: see [[#Run logs]].

## Code layout

| Path | Holds | Source | On `dev` (2026-10-22) |
|---|---|---|---|
| `packages/core/ports/` | *"AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource interfaces"* | PRD §3 | `core/src/ports/`, with `agent-provider.ts`, `events.ts` and `exec-host.ts` only |
| `packages/core/events.ts` | *"NormalizedEvent, versioned (§7 "Events")"* | PRD §3 | `core/src/ports/events.ts`, not versioned (C10 in [[Provider Implementation Decisions]]) |
| `packages/adapters/agent/` | *"claude-cli, codex-cli (later), replay"* | PRD §3 | `adapters/src/agent/claude/`, `opencode/` and `replay/` |
| `packages/adapters/exec/` | *"host, docker"* | PRD §3 | `adapters/src/exec/host.ts`; no docker |
| `adapters/agent/claude/ codex/ replay/` | the architecture's layout | architecture README | no `codex/`; `opencode/` instead |
| `docs/old/reference/core/ports/agent-provider.ts`, `events.ts`, `exec-host.ts` | reference port types | the reference tree; `reference/README.md`'s file map lists the first two but omits `exec-host.ts` | still there; the shipped port replaced them |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | runnable reference adapter | `reference/README.md` | still there; replaced by `adapters/src/agent/replay/` |

The shipped paths are under `code/flowboard/packages/`. Also built, with no path in the design: `core/src/guard.ts` (the guards), `core/src/prompt.ts`, `core/src/hitl/question.ts`, `adapters/src/agent/summarize.ts`, `adapters/src/exec/terminate.ts`, `ask-user/` (the ask_user shim) and `cli/` (`run-agent`).

Reference files use *"relative imports … so they run with zero config"* and *"`import type` only, so at runtime these depend on nothing but Node builtins"*; *"Avoid TS features that need a transform (e.g. parameter properties, enums) so strip-only runtimes keep working."* (`reference/README.md`)

## Per-run files

| Path | Content | Source |
|---|---|---|
| `data/runs/<id>/args.json` | *"Snapshot the final args"* of the `claude` command | PRD §7; backlog Story 3.2 |
| `data/runs/<id>/spec.json` | The resolved `RunSpec` (idea) | `03` §6 |
| *"raw stream"* next to `spec.json` | *"Run records / data/runs/<id>/spec.json + raw stream, replayable at $0"* | drawio *Harness architecture* |
| per-run `mcp.json` | points the CLI at the ask-user shim | PRD §7, §9 |
| per-run `settings.json` | `PreToolUse` hooks | PRD §7 |
| `data/sock/<run_id>.sock` | the broker socket the shim forwards to | PRD §9 |

The repository's root `.gitignore` covers `data/runs/` (backlog Story 0.3). Whether a run keeps `args.json` or `spec.json` is [[Execution Open Questions]] #38; where `mcp.json` and `settings.json` are written is not stated ([[Execution Open Questions]] #39). The drawio *Logical components* page also keeps *"session logs"* on *Disk*, without a path.

Since 2026-10-18 no `mcp.json` or `settings.json` is written at all: each adapter builds its config in memory ([[Agent Providers Open Questions]] #4).

## Run logs

> [!check] Implemented 2026-10-18

`pnpm run-agent` keeps one record per run: `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`, stamped in local time, in the folder the command was run from (pnpm's `INIT_CWD`, which `cli/src/main.ts` passes to `cli/src/run.ts`). A name already taken gets `-2`, `-3`, … after the adapter. Each line is one JSON object with a `kind` and an `at` timestamp, appended as it happens. There are six kinds:

| `kind` | Other fields | Written |
|---|---|---|
| `start` | `yaml`, the file's absolute path; `config`, the `RunSpec` as launched, with the ask_user server | once, just before `launch()` |
| `event` | `event`: one `NormalizedEvent`, with its `raw` native message | for each event |
| `question` | `batch`, numbered within the run; `questions` | when a batch arrives, even if it waits behind another |
| `answer` | `batch`, `answers` | when the owner answers the batch |
| `withdrawn` | `batch` | when the agent stops waiting, or the run ends, before an answer |
| `result` | `result`: the `RunResult` | last |

A bad command line or YAML file writes no log. A run that fails during setup has only a `result` line.

While a run lasts, `run-agent` also keeps a temp folder `/tmp/fb-*`, holding the broker socket `ask.sock` (the design's `data/sock/<run_id>.sock`) and the copied `skills:` plugin. The OpenCode adapter keeps a scratch `XDG_CONFIG_HOME` (`fb-oc-*` in the system temp folder). Both are deleted when the run ends.

> [!check] Changed 2026-10-22
> `code/flowboard/.gitignore` ignores `/runs/`, because a log holds prompts, answers and raw events. The pattern is anchored: it covers only `code/flowboard/runs/`, where the logs land when the command runs from `code/flowboard`, not a `runs/` folder anywhere else (R39 in [[Run Agent CLI Decisions]]). Question batches are numbered and logged when they arrive, a decision taken 2026-10-22 and open to Alex's review; before, a batch withdrawn while it waited in the queue left no `question` line.

## In the database

`run_events.raw` keeps *"the original JSON line"* (PRD §5) so *"a new provider's parser can be debugged against real captures without re-spending"* (`01-ports.md`). See [[Agent Providers Data Model]].

As built there is no database. Each `event` line in a run log keeps the event's `raw`: the Agent SDK message or OpenCode server event it came from. An error the adapter raises with no native message behind it has none. Nothing replays a run log yet; the normalizer tests replay the captures below.

## Captures

| File | Content |
|---|---|
| `docs/old/stream-sample.jsonl` | The PRD §0 probe: 22 `stream-json` lines. PRD §0 names the path `docs/stream-sample.jsonl`. |
| `docs/old/stream-sample.stderr` | Its stderr, empty in this capture |
| `code/flowboard/packages/adapters/test/fixtures/claude-hello.jsonl` | The same 22 lines, byte for byte. The Claude normalizer and provider tests replay it |
| `code/flowboard/packages/adapters/test/fixtures/opencode-read.jsonl` | One OpenCode event stream (87 events), recorded by `capture-opencode.ts` beside it. The OpenCode normalizer tests replay it |

See [[Stream Parsing And Normalization]].

## Related

- [[Agent Providers Data Model]]
- [[Execution Storage]]
- [[Replay Provider]]
- [[Run Config Reference]]
- [[Testing The Run Agent CLI]]
- [[Provider Boundary Rules]]
