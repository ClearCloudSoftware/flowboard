---
tags: [flowboard, agent-providers, roadmap]
module: Agent Providers
---

# Agent Providers Roadmap

> [!question] The build overtook the v1 plan
> The plan below makes v1 Claude-only, with Codex as the next provider. On 2026-10-18 the OpenCode adapter was built as the second real provider, together with the `run-agent` CLI and ask_user, which the plan does not mention. Codex is designed, not built. Whether OpenCode is in v1, and whether Codex is still next, is not decided: see [[Agent Providers Open Questions]].

## v1 scope

The plan, with what exists on `dev` as of 2026-10-22.

| Item | Source | Status |
|---|---|---|
| The `AgentProvider` port in `packages/core/ports` | PRD §3 | Built 2026-10-18 in `core/src/ports/` ([[AgentProvider Port]]) |
| The Claude Code adapter (`claude -p`, stream-json, flags as PRD §7) | PRD §7; M3 in PRD §14 | Built 2026-10-18 on the Claude Agent SDK, which runs the installed `claude` CLI; SDK options replace the PRD's flags ([[Claude Code Adapter]]) |
| `NormalizedEvent` v1, raw line kept, OTel-named fields | PRD §5, §7 | Built 2026-10-18 without `v` (decision C10 in [[Provider Implementation Decisions]]): eight kinds, each with an optional `raw` native message ([[Normalized Event Envelope]]) |
| The ReplayProvider / fake-`claude` test lane | backlog Story 0.2; drawio *Test lane* | Replay built 2026-10-18 as a scripted event stream, used only in tests. No fake `claude` replays a recorded stream; the Claude normalizer is tested on one instead ([[Agent Providers Open Questions]] #20) |
| Park and resume via `--resume --fork-session` | PRD §9; M4 | Partly: both adapters take `RunSpec.resume`, plain or forked, but nothing passes it yet, and parking is not built |
| Draft mode forcing haiku/low, recording the actual model/effort | PRD §13; backlog 3.2 | Not built |
| ExecHost spawning so any provider runs sandboxed | backlog Story 3.5 | Partly: both adapters spawn through `RunSpec.exec`; only the host tier exists |
| Claude-only; aliases as logical ids; no provider column | [[Capability Library Decisions]] D1, D20, D23 | Overtaken: OpenCode was built too. The Claude adapter takes aliases as they are; there is no database, so no columns |

## Built outside this plan

| When | What | See |
|---|---|---|
| 2026-10-18 | The OpenCode adapter: one `opencode serve` per run, on non-Claude models. The [[Provider SDK Fit Analysis]] recommended it as the second provider | [[OpenCode Adapter]] |
| 2026-10-18 | `pnpm run-agent <task.yaml>`: one YAML file runs either provider, prints the events and logs them to `runs/`. It stands in for the runner, which is not built | [[Run Config Reference]], [[Run Agent CLI Decisions]] |
| 2026-10-18 | ask_user: the `ask-user` MCP shim forwards the agent's questions to `run-agent`, which asks them in the terminal | [[Run Agent CLI Decisions]], [[Testing The Run Agent CLI]] |
| 2026-10-22 | Fixes after the [[Agent Providers Docs Audit]], listed below | [[Provider Implementation Decisions]], [[Run Agent CLI Decisions]] |

The 2026-10-22 fixes. The decisions behind them were taken that day and are open to the owner's review.

- On OpenCode, an allow entry that globs to any shell command (`*`, `b*`, `Bash(?*)`) needs `allow_unrestricted_shell: true`.
- A recursive `rm` must stay inside the write roots, checked where the shell is (its current folder on Claude, bash's `workdir` on OpenCode, a literal `cd`). The rule is built into the guard, not a regex callers opt into.
- File-edit writes are checked where they land, after following links; `~/` is the home folder.
- `deny_paths` globs match dot-files, and ignore letter case on macOS and Windows.
- The built-in `git push` and `git reset --hard` rules also catch git's global options (`git -C . push`).
- `code/flowboard/.gitignore` ignores the run logs in `/runs/`.
- OpenCode runs inherit no `OPENCODE_*` setting except credentials, and no Anthropic key.
- A native OpenCode pack can no longer replace the adapter's own config keys.
- An explicit deny of the ask tool wins on both adapters.
- A stopped or failed run reports its last running usage, not zero.
- `numTurns` counts the main agent's turns on both providers.
- Replay fails on a scripted error and rejects a missing session id.
- `run-agent` numbers question batches and logs each one when it arrives.

## Designed beyond the PRD

| Item | Source | Status |
|---|---|---|
| Codex adapter, and the spike against three risk points | `01-ports.md`; `06`; drawio | Not built. OpenCode took the second-provider role |
| ACP as the port | `01-ports.md`; README open decision 2 | Not built. The Fit Analysis found the hand-written port viable, and that port was built ([[Agent Providers Open Questions]] #18) |
| Abstract logical ids (`reasoning-high`, `fast-cheap`, `default`) and per-provider resolution tables | `01-ports.md` | Partly: the OpenCode adapter takes a table, which `run-agent` leaves empty; no shared vocabulary ([[Logical Model Ids]]) |
| Capability contract at design time; editor greys unsupported knobs | `01-ports.md`; `02` §2 | Not built: nothing reads a provider's `capabilities` |
| Provider-format packs and the provider-match check | `05` §13; capability-library mockup | Partly: a `CapabilityPack` names its provider and can be `native`; no adapter checks the provider (decision C7) |
| `runs.provider`, `runs.agent_session_id` | `02` §1 | Not built: no database |
| PricingService rate rows for token-only providers | `06` §12 | Not built |
| Snapshot `spec.json` and replay any run through ReplayProvider | `03` §6 | Not built. `run-agent` logs each run's events to `runs/*.jsonl` |
| A plain OTel exporter to Langfuse (PRD §7 names it too, as *"later"*) | `01-ports.md`; PRD §7; drawio *Langfuse (later)* | Not built |
| `StepExecutor` interface, where `agent`/`skill` delegate to a provider | `02` §3 (optional) | Not built |

## Ideas

- *"Auto-pick the AI per step"* (feature map, parking lot).
- *"Replay any past run — step through exactly what happened, to debug it after the fact."* (feature map, parking lot).
- *"Run agents in the cloud, not just your laptop"* (feature map, parking lot); the worker as *"a **generic executor host**"* that *"later allows remote executors or a fleet"* (`03` §7).
- Gemini CLI as another adapter (architecture README, five-ports table).
- Feature map §6 *💡 Ideas* is empty.

## Out of scope

- *"anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI."* (PRD §17). This holds on the Claude Code adapter. The OpenCode adapter's server calls its model provider's API directly, with OpenCode's own credentials; since 2026-10-22 it never inherits an Anthropic key, but an `anthropic/...` model still runs when OpenCode's own credentials hold one.
- *"multi-machine support"* (PRD §17).
- A second provider in v1 ([[Capability Library Decisions]] D1). Overtaken: OpenCode was built on 2026-10-18; whether it is in v1 is open ([[Agent Providers Open Questions]]).

## Related

- [[Agent Providers Open Questions]]
- [[Codex Adapter]]
- [[OpenCode Adapter]]
- [[Agent Client Protocol Option]]
- [[Execution Roadmap]]
- [[Capability Library Roadmap]]
