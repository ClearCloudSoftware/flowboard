---
tags: [flowboard, agent-providers, sources]
module: Agent Providers
---

# Agent Providers Sources

What each source contributed. There is no mockup for this component; sibling mockups mention it in sample data.

| Source | Contributed |
|---|---|
| `docs/FlowBoard/Component Documentation Tracker.md` | Scope (*"AgentProvider port, capability negotiation, logical models, Claude / Codex / replay"*), feature map §6, architecture #5 and `01-ports.md`; platform component, documented as architecture reference |
| `docs/feature-map.md` §6 | The four features and the ❓ (Codex early, ACP first); empty 💡 slot |
| `docs/feature-map.md` §2, §7, §16, §18, *Across everything*, parking lot | Steps name a model and effort; draft mode; agents with a preferred model; spend per model; *Keeping the pieces swappable* (*"the AI tool"*); *Testing* (*"fake, free agents"*); *Auto-pick the AI per step*; *Replay any past run*; *Run agents in the cloud* |
| `docs/old/architecture/01-ports.md` | The `AgentProvider` sketch, `Capability` (with `tool_hooks`), `RunSpec`, `AgentRun`, `RunResult`; the event envelope, versioning, OTel names, raw line; capability negotiation's five rules and the design-time warning; logical model ids; ReplayProvider; *Validating the port* (ACP, the three Codex risk points); ExecHost and the permission gate |
| `docs/old/architecture/03-execution-substrate.md` §5–§8 | Component #5's role, seam, Claude flags, the five Claude-specific fixes; *"zero provider strings"*; runner use of the port, draft mode as a transformer, credential proxy, `spec.json` replay idea; worker as a generic executor host; viewer never parses provider JSON |
| `docs/old/architecture/06-cost-and-platform.md` §12, §15, *Where a new provider actually touches the codebase* | PricingService and native cost as the degenerate case; `SpecTransform` and draft mode (`fast-cheap`); *"If a route ever needs to know whether it's Claude or Codex, something leaked upward"*; the four-step acceptance test |
| `docs/old/architecture/02-core-and-engine.md` §1–§3 | `claude_session_id → agent_session_id`, `runs.provider`, `runs.model`/`effort`, `skills.provider`/`format`; capability contract in validation; engine depends only on `RunResult`; `StepExecutor` sketch |
| `docs/old/architecture/04-hitl-and-notify.md` §9, §10 | Park/resume as the provider-agnostic primitive; MCP injection vs artifact-file fallback by capability; *"Claude *and* Codex speak MCP"*; Slack's *"300s replay window"* (§10, the glossary's unrelated *replay*) |
| `docs/old/architecture/05-environment-and-registry.md` §13 | Skill as one packaging; `CapabilityPack` with a `mount(spec)` method; logical ids for agents; pack provider must match step provider |
| `docs/old/architecture/07-ports-in-practice.md` | ReplayProvider call site; *"same three members"*; the runner composition sketch (no `exec`, live cost only on `result`); *"constructing a different `provider` in the composition root"* |
| `docs/old/architecture/08-sandboxing.md` | *"The sandbox is not a new kind of AgentProvider"*; 2×N; the gate on the host tier; Codex's own OS sandbox; Claude Code rejecting root; `runs.sandbox` beside `runs.model`/`effort`; prior art; *The security profile* (*"Drop capabilities: `--cap-drop ALL`"*, the glossary's kernel *capability*) |
| `docs/old/architecture/09-memory.md` | Memory touches *"the prompt contract on AgentProvider"*; recall/write bracket `launch()` |
| `docs/old/architecture/README.md` | *"Claude Code and Codex are interchangeable adapters"*; *"already the provider seam"*; the provider-agnostic graph; five-ports table (*Codex, Gemini CLI, ReplayProvider*); the dependency rule and lint; the spec's leaks; module layout `adapters/agent/claude/ codex/ replay/`; component index #5; open decision 2 (ACP + Codex spike) |
| `docs/old/reference/core/ports/agent-provider.ts` | The reference port: `ProviderId`, `Effort`, `Capability` (no `tool_hooks`) with per-flag meanings, `ArtifactRef`, `PromptParts`, `ToolServer`, `CapabilityPack`, `RunSpec` (with `exec`), `RunResult`, `AgentRun`, `AgentProvider`; the two-mappings comment |
| `docs/old/reference/core/ports/events.ts` | Header (the four consumers), `Usage`, the seven `NormalizedEvent` kinds (no `v`) |
| `docs/old/reference/core/ports/exec-host.ts` | `ExecHost`, `SandboxProfile` (`env` for *"model/CLI auth"*, `nonRoot`), `ChildHandle`, `IsolationTier`; *"any provider × any isolation tier"* |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | `ReplayScript`, the replay adapter's behaviour (including when `result` settles and how `stop()` lands), capabilities and self-check |
| `docs/old/reference/README.md` | File map (which omits `exec-host.ts`), how to run the self-checks, strip-only TypeScript rules |
| `docs/old/PRD.MD` §0 | The `stream-json` probe, `claude --version`, the credential-proxy probe; *"stop and say so"* |
| `docs/old/PRD.MD` §1, §2, §3 | Each step a headless Claude Code session; web never spawns; `packages/core/ports`, `events.ts`, `adapters/agent/ # claude-cli, codex-cli (later), replay` |
| `docs/old/PRD.MD` §5 | `step_defs.model`/`effort`/`permission_mode` defaults, `agents.default_model` (*"a Claude alias, used as the logical model id"*), `runs` columns, `run_events.v`/`type`/`raw`/`summary` |
| `docs/old/PRD.MD` §7 | The `claude` command; `--plugin-dir` rules; `mcp__vibe__*`; `args.json`; hooks and `tool_hooks`; prompt parts; versioned events; event handling; cost; exit classification; sandboxed runs |
| `docs/old/PRD.MD` §9, §11.1, §12, §13, §14, §15, §16, §17 | Resume flags and the MCP fallback; credential proxy, `runs.sandbox` beside `runs.model`/`effort`, `sandbox_profile`; thin routes; draft mode haiku/low, spend per model × effort; M3; seed flow models; acceptance; *"Every model call goes through the `claude` CLI"* |
| `docs/old/REBUILD-BACKLOG.md` | Preamble item 6 (`--add-dir`, `~/.claude` hooks); Stories 0.1 (probe, flags, isolation DEC), 0.2 (fake `claude` binary), 0.3 (`.gitignore`), 1.1 (`runs.model`/`effort`), 1.1 also `runs.sandbox`, `step_defs.sandbox_profile`; 3.2 (command, resume prompt, `message_delta`, `total_cost_usd`, `is_error`, draft mode), 3.3 (session id once, restart, graceful shutdown), 3.4 (viewer, Stop by pid), 3.5 (ExecHost, limit hits, transforms compose), 4.2 (resume race), 7.3 (importer agent), 8.1, 8.2; decisions D5, D9 |
| `docs/old/stream-sample.jsonl`, `stream-sample.stderr` | 22 native lines and their types; where `session_id`, `total_cost_usd`, `num_turns`, `message_delta.usage` live; native model id; the unisolated hooks (injecting personal plugin text), plugins and MCP servers; the CLI's own `capabilities`; `rate_limit_info`; empty stderr |
| `docs/flowboard-ideation.drawio` — *FlowBoard ideation* | *Runner & live viewer* (*"stream-json → 7 event kinds / Parser written against docs/stream-sample.jsonl"*); *Architecture · ports & adapters* group (*"Claude Code and Codex as interchangeable adapters"*): *Five ports*, *core/ never imports adapters/*, *Codex adapter spike*, *ReplayProvider*; edge *Codex adapter spike → Five ports*; *Draft mode toggle*; *No direct Anthropic API* |
| `docs/flowboard-ideation.drawio` — *Logical components* | `AgentProvider` port; adapters *Claude Code CLI*, *Codex CLI* (solid despite *"dashed = not in v1"*), *ReplayProvider*; edges *Run orchestrator → AgentProvider*, *AgentProvider → each adapter*, *Run orchestrator → Task & run state (events, cost)*; the core *Run orchestrator* that *"parses stream-json"*; *Disk* with *"session logs"* |
| `docs/flowboard-ideation.drawio` — *Functional components* | *Run a step / spawn headless session in its worktree*; *Author steps / … model, effort*; *Draft mode / force haiku / low effort*. No provider node. |
| `docs/flowboard-ideation.drawio` — *Harness architecture* | *AgentProvider port* node (Claude, Codex later, Replay at $0, ACP spike); *Runner*, *Stream parser*, *Test lane*, *Run records … replayable at $0*; sandbox image with both CLIs; egress allowlist with *api.openai.com (later)*; *OpenAI / Codex CLI adapter (later)*; *Langfuse (later)*; the *claude* card's flags; the separate *Stream parser* node; edges E, F (*"HTTPS_PROXY"*), G; *Life of one step* letters C–I |
| `docs/mockups/capability-library.html`, `capability-library-guide.html` | `PROVIDERS`, packs per provider, the provider-match refusal, *"codex packs for 7 of 17"*; *"model id, which is logical and mapped by the adapter"*; *"Steps name their provider individually — one flow can mix them"* |
| `docs/mockups/monitor.html`, `inbox.html`, `inbox-guide.html` | The `provider-codex` sample task and its cost question |
| `docs/mockups/README.md` | A pack per provider; Claude and Codex coverage |
| `docs/pitch.md` | *"provider-agnostic by design"*; *"a replayable fake-agent for tests"*; the provider seam as the path to a shared tier |
| `docs/competitor-multica.md` | *"One seam, Claude Code first, Codex intended"* vs *"26 agent CLIs today"*; *"provider-agnosticism"* among what Multica already ships |
| Sibling vault sets | [[Agent Launch Contract]], [[Prompt Assembly]], [[Draft Mode And Spec Transforms]], [[Execution Testing]], [[Execution Open Questions]] #7, #31, #38, #39, #42, #45, #47, #51, #52, #53, #55, #56, #62, #63; [[Models And Effort]]; [[Usage And Native Cost]], [[Pricing Service]]; [[Capability Library Decisions]] D1, D2, D20, D23; [[Capability Versus Provider Pack]], [[Provider Coverage And Portability]]; [[Event Stream And SSE]], [[Monitor Open Questions]] #35, #36, #38, #39; [[Cost And Control Open Questions]] #2, #7, #14, #16; [[Flow Design Open Questions]] #15; [[Human In The Loop Open Questions]] #9; [[Sandboxing Open Questions]] #24, #25, #26, #28; [[Settings And Plumbing Open Questions]] #2, #10, #22; [[Intake And Import Open Questions]] #12 |

## Not found

No source mentions providers in `docs/mockups/flow-designer*.html` beyond model and effort controls (no provider selector), in `task-detail*.html` beyond per-step model and effort, or in `docs/old/reference/core/ports/artifact-store.ts`, `task-source.ts`, `memory-store.ts` or `core/hitl/question.ts`. `workspace.ts` repeats that *"AgentProvider adapters spawn the CLI through this, so sandboxing is orthogonal to which provider runs"*; `notifier.ts` uses *provider* only for a chat message id. `docs/old/design/` (`brief.md`, `README.md`, `Vibe Kanban.dc.html`) only repeats the headless-session and model/effort points: *"each step being a headless Claude Code session with its own model and effort level"* (`brief.md`) and step chips such as `opus · high` and `sonnet · med`.

## Related

- [[Agent Providers Index]]
- [[Agent Providers Open Questions]]
- [[Component Documentation Tracker]]
