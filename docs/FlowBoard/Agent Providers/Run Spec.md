---
tags: [flowboard, agent-providers, concept, contract]
module: Agent Providers
---

# Run Spec

`RunSpec` is *"Everything needed to launch one attempt of one step, provider-agnostically."* (`core/src/ports/agent-provider.ts`). The caller builds it: today that is `run-agent`, from one YAML file ([[Run Config Reference]]); later, the runner. The adapter turns it into its provider's options and config.

> [!check] Implemented 2026-10-18
> `RunSpec` is in `core/src/ports/agent-provider.ts`. It gained `permissionMode`, `systemPrompt` and `guards` on 2026-10-18 ([[Agent Providers Open Questions]] #4); the other ten fields are the reference port's.

## Fields

| Field | Type | Port wording (`core/src/ports/agent-provider.ts`) and notes |
|---|---|---|
| `prompt` | `PromptParts` | The six-part prompt (below) |
| `model` | `string` | *"Logical model id; the adapter resolves it via resolveModel() (Claude: an alias, as is; OpenCode: its table, or "provider/model" as is)."* See [[Logical Model Ids]]. |
| `effort?` | `Effort` | *"Dropped by the adapter when `effort` is unsupported."* `01-ports.md`: *"low\|medium\|high\|xhigh\|max (dropped if unsupported)"*. Claude passes it to the SDK; OpenCode uses it only as a model variant of the same name and drops it otherwise. |
| `toolPolicy?` | `{ allow?: string[]; deny?: string[] }` | *"Tool allow/deny entries in Claude Code's vocabulary (`Read`, `Bash(git *)`, `mcp__server__tool`); other adapters translate them. The adapter always pre-approves each injected tool server, so neither a restrictive allow list nor a missing one can lock out HITL; an explicit deny still wins."* See *Tool policy* below. |
| `tools?` | `ToolServer[]` | *"MCP servers to inject. Ignored when `mcp_tools` is absent."* |
| `capabilities?` | `CapabilityPack[]` | *"Skills/plugins to mount."* |
| `cwd` | `string` | *"Workspace path (the Workspace port owns its lifecycle)."* The Workspace port is not built; `run-agent` passes the YAML's `folder`, resolved to its real path. |
| `exec?` | `ExecHost` | *"Where the CLI process runs — host by default, or a sandbox (container/microVM). The adapter spawns through this instead of raw child_process, so sandboxing works for any provider. From `workspace.execHost(task)`."* Only the host tier is built (`adapters/src/exec/host.ts`), and `run-agent` passes none. See [[Providers And Sandboxing]]. |
| `resume?` | `{ sessionId: string; fork?: boolean }` | *"Resume a prior session; `fork` requires the `resume_fork` capability, else context-replay."* Both real adapters continue a session in place or fork it; context-replay is not built, and no caller passes `resume` yet. See [[Session Resume And Context Replay]]. |
| `limits?` | `{ maxTurns?: number; maxBudgetUsd?: number }` | Claude passes both to the SDK. OpenCode sets `maxTurns` as `steps` on its `build`, `plan`, `general` and `explore` agents, and enforces the budget itself from OpenCode's reported cost. Running out fails the run (see [[Agent Run Handle And Result]]). |
| `permissionMode?` | `PermissionMode` | *"Chosen by the caller (run-agent's `permissions.mode`; the runner's permission gate is not built); adapters default to the most restrictive headless mode, `dontAsk`."* The six modes are Claude Code's: `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`. OpenCode emulates them with permission rules and its answers to permission requests. `run-agent` defaults to `acceptEdits`; see [[Run Config Reference]]. |
| `systemPrompt?` | `string` | *"The agent's system prompt, added to the provider's own (Claude: appended to the claude_code preset)."* OpenCode sends it as the prompt's `system`. On both, the text of `system_prompt` packs follows it. |
| `guards?` | `GuardRules` | *"Enforced in-agent when the provider has `tool_hooks`."* See *Guards* below. |

## `PromptParts`

> *"The six-part prompt (PRD §7), passed structured rather than pre-flattened so each adapter can place the parts where its provider wants them (e.g. system vs user turn). A core helper renders the canonical order (../prompt.ts). Assembly itself is provider-neutral and lives in the runner."* — `core/src/ports/agent-provider.ts`

> [!warning] The shipped code differs
> The reference port added *"adapters must not reorder"*. The shipped port dropped it, because both adapters change the invocation. `renderPrompt` (`core/src/prompt.ts`) joins the non-empty parts in the order below, with blank lines between them. Claude renders the other parts and puts the invocation first, since the CLI treats only a leading `/` as a slash command. OpenCode, which has no plugin namespace, rewrites the invocation as `Use the "<slug>" skill.` in its usual place.

| # | Field | Port wording |
|---|---|---|
| 1 | `preamble: string` | *"Preamble: task title + body."* (PRD §7 adds acceptance criteria and non-goals) |
| 2 | `inputs: ArtifactRef[]` | *"Input artifacts — "read these first"."* Rendered under *Read these first:* |
| 3 | `outputs: ArtifactRef[]` | *"Exact output paths the step must write, one per `produces`."* Rendered under *Write your output to:* |
| 4 | `invocation?: string` | *"Slash invocation for a skill, fully qualified, e.g. "/grill-me:grill-me"."* (PRD §7: `/<plugin>:<slug>`) |
| 5 | `template?: string` | *"`prompt_template` with {{placeholders}} already substituted."* |
| 6 | `closing: string` | *"Closing headless instruction: no terminal, use ask_user for questions."* |

`ArtifactRef` is `{ type, path }`: *"Declared artifact type key, e.g. 'research_brief'"* and *"Absolute path in the task's workspace."*

`run-agent` fills only `preamble` (the prompt file), `invocation` (the YAML's `skill`, with `/<name>` turned into `/local:<name>` for a `skills:` folder) and `closing` (its fixed text telling the agent to ask through `ask_user`). `inputs` and `outputs` are empty.

The full assembly rules, including the optional memory part 7 that `PromptParts` has no slot for, are in [[Prompt Assembly]] ([[Execution Open Questions]] #51). `09-memory.md` lists *"the prompt contract on AgentProvider"* among what memory touches.

## `ToolServer`

```ts
export interface ToolServer { name: string; command: string; args?: string[]; env?: Record<string, string>; }
```

The ask-user shim is the one named example. PRD §9: *"The runner writes a per-run `mcp.json` pointing at it and passes `RUN_ID` and the socket path as environment variables."*

> [!warning] The shipped code differs
> No `mcp.json` is written. Each adapter turns `tools` into its own config, in memory: Claude into SDK `mcpServers` (stdio, with `strictMcpConfig`), OpenCode into config `mcp` entries inside `OPENCODE_CONFIG_CONTENT`. Both lift the MCP tool-call time limit to about 24.8 days, so a question can wait for its answer. `run-agent` adds the shim as a server named `flowboard` (`node ask-user/src/main.ts`) and gives it only `FLOWBOARD_ASK_SOCKET`, no `RUN_ID` ([[Run Agent CLI Decisions]] R18, R20).

## `CapabilityPack`

```ts
export interface CapabilityPack {
  id: string;
  provider: ProviderId;
  mount:
    | { kind: 'plugin_dir'; path: string } // Claude: plugins [{ type: 'local', path }]
    | { kind: 'system_prompt'; text: string } // provider without plugins
    | { kind: 'native'; config: Record<string, unknown> };
}
```

*"The registry stores it; the adapter interprets `mount` in its own terms."* (`core/src/ports/agent-provider.ts`). `05` §13 sketches `mount(spec: RunSpec): void` as a method instead; [[Capability Library Decisions]] D2 settled it as data. Mounting itself is documented in [[Capability Runtime Mounting]].

| `mount.kind` | Claude Code | OpenCode |
|---|---|---|
| `plugin_dir` | SDK `plugins: [{ type: 'local', path }]`; the run fails with *plugin not loaded* when the CLI does not list the folder | config `skills.paths` gets `<path>/skills`; nothing else in the folder is read |
| `system_prompt` | appended to the system prompt | added to the prompt's `system` |
| `native` | ignored | applied first; the adapter's own top-level keys (`permission`, `experimental`, and when set `mcp`, `skills`, `agent`, `plugin`) then replace the pack's (since 2026-10-22; [[Agent Providers Open Questions]] #2) |

Neither adapter checks `provider` ([[Provider Implementation Decisions]] C7), and no registry exists yet.

## Tool policy

Entries use Claude Code's tool names, such as `Read`, `Bash(git *)` and `mcp__server__tool`.

- **Claude** passes `allow` as `allowedTools` and `deny` as `disallowedTools`. Claude matches allow rules by exact tool name, so `allow: ["*"]` allows nothing (checked in the Claude Code 2.1.302 binary).
- **OpenCode** turns each entry into a permission rule. Known names map through a table (`Write` and `Edit` → `edit`, `Bash` → `bash`, `LS` → `list`), other names are lowercased, and `mcp__server__tool` becomes `server_tool`. OpenCode matches both the name and the pattern as globs, and the last matching rule wins.
- Patterns pass through as written, so a pattern may match on one provider and not the other ([[Provider Implementation Decisions]] O11).
- **Injected tool servers.** Each adapter pre-approves every server in `tools`, not just ask_user: Claude adds `mcp__<name>__*` to `allowedTools`, and OpenCode adds a `<name>_*` allow rule. So no allow list, and no missing one, can lock out asking.
- **An explicit deny wins on both adapters**, including a deny of the ask tool (`mcp__flowboard__ask_user`, `mcp__flowboard__*` or `*`). Since 2026-10-22, OpenCode places the deny rules after the pre-approval, as Claude's `disallowedTools` already behaved (decided 2026-10-22, open to Alex's review: [[Agent Providers Open Questions]] #31).
- **Any-shell entries on OpenCode.** Because OpenCode globs the tool name, an allow entry such as `*`, `b*`, `ba?h` or `Bash(?*)` lets the agent run any shell command there. The port does not check this. `run-agent` refuses such entries on `adapter: opencode` unless `permissions.allow_unrestricted_shell: true` is set ([[Run Config Reference]]).

## Guards

```ts
export interface GuardRules {
  /** Absolute dirs writes may land in, links followed; normally just the task's worktree. A recursive `rm` must stay inside one too. */
  writeRoots: string[];
  /** Globs relative to `cwd` (path.matchesGlob: `*` stays in one folder, dot names match, case is ignored on macOS and Windows), from the task's non-goals; no file-edit write may match one. */
  denyPaths?: string[];
  /** Regex sources matched against shell commands; a match is denied. Nothing is added for you: pass DEFAULT_DENY_COMMANDS for PRD §7's set. */
  denyCommands?: string[];
}
```

An adapter with `tool_hooks` checks every tool call with `checkToolCall` (`core/src/guard.ts`). Claude does it in an in-process `PreToolUse` hook, registered only when `guards` is set. OpenCode does it in a guard plugin that translates its tool names; the adapter fails the run if the plugin did not load. A denied call returns the reason to the agent instead of running. For the `rm` rule each adapter also says where the shell is: Claude passes the hook input's `cwd` (a `cd` persists between Bash calls), OpenCode passes bash's `workdir`, resolved against the run's folder.

> [!check] Changed 2026-10-22
> The recursive-`rm` rule is now built in, derived from `writeRoots`, and checked where the shell is; writes are checked where they land, after following links, with `~/` as the home folder; `denyPaths` globs match dot names and, on macOS and Windows, ignore case; and the `git` rules in `DEFAULT_DENY_COMMANDS` allow git's global options. These were decided on 2026-10-22 and are open to Alex's review ([[Agent Providers Open Questions]] #1; C18 in [[Provider Implementation Decisions]] for the `git` rules).

| Rule | What is denied | Message |
|---|---|---|
| `writeRoots` | A file-edit write (Claude: `Write`, `Edit`, `MultiEdit`, `NotebookEdit`; OpenCode: `write`, `edit`, `apply_patch`) that lands outside every root. Links are followed, a dangling one too, and a missing tail is kept as written. A leading `~/` is the home folder. The roots are resolved the same way | *Write outside the worktree: \<path\>*, or *Write through a link to outside the worktree: \<path\> -> \<where it lands\>* |
| `writeRoots`, recursive `rm` | Applies whenever `guards` is set, even with no `denyCommands`. A recursive `rm` (`-r`, `-R`, any short-flag group holding `r` or `R`, `--recursive`) whose operand lands outside every root after links are followed, or is a root itself. An absolute path inside the folder is fine, and so is `.`, which `rm` refuses anyway; `/tmp/x`, `../x` and `/` are refused. A link named without a trailing slash is the link itself; `link/` is checked where it points | *Recursive rm outside the worktree: \<operand\>* |
| | ... or whose operand the shell would expand: it holds `$`, a backtick or `\`, starts with `~`, has a path segment that starts with `.` and holds `*`, `?` or `[` (`.*` can expand to `..`), or has a brace other than a simple list (`{dist,build}` is expanded and each part checked) | *Recursive rm of a path the shell expands: \<operand\>* |
| | ... or whose operand is relative, after a `cd` the guard cannot follow | *Recursive rm after a cd the guard cannot follow: \<operand\>* |
| | ... or that `xargs` feeds | *Recursive rm through xargs: its paths come from stdin; use find … -exec rm -rf {} +* |
| `denyPaths` | A file-edit write whose path, relative to the resolved `cwd`, matches a glob. The matcher is Node's `path.matchesGlob`: `*` stays in one folder and `**` crosses folders, so `*.lock` covers only top-level lock files and `**/*.lock` covers all. Dot names match (`secret/**` covers `secret/.env`, `**/.env` covers `.config/.env`). On macOS and Windows the path and the glob are lower-cased first, so case is ignored (`docs/**` covers `DOCS/a.md`); on Linux it counts | *Path is a non-goal: \<glob\>* |
| `denyCommands` | A shell command matching one of the regexes. Nothing is added for you. `DEFAULT_DENY_COMMANDS` holds PRD §7's `git push` and `git reset --hard` (also with git's global options in between, such as `git -C . push`), and `curl` or `wget` piped into a shell, and `run-agent` adds it to every run. PRD §7's base-branch `git checkout` needs the branch name, so `core/src/guard.ts` leaves it to the runner, which is not built | *Command blocked by policy: \<regex\>* |

Limits of the guards:

- Only file-edit tools and recursive `rm` are checked against paths. Any other shell command an allow rule permits can still write anywhere.
- The `rm` check splits the command on `;`, `&`, `|`, `(`, `)` and newlines, backtick substitutions and line continuations included, and strips quotes, so `bash -c "rm -rf /"`, `sudo rm`, `/bin/rm` and `\rm` are caught. Options may come before or after operands, `--` ends them, and redirections such as `2>/dev/null` are not operands.
- Operands resolve where the shell is: the folder the adapter passes, then any literal `cd` or `pushd` earlier in the same command, also after a shell keyword (`if cd /tmp; then rm -rf foo; fi` is refused). A `cd` the guard cannot follow is `cd "$X"`, `cd ~`, a `cd` with an option such as `cd -` or `cd -P x`, or a bare `cd`. `find … -exec rm -rf {} +` (or `{} \;`) is checked against find's starting points.
- A script, `eval`, `find -delete`, or another command that deletes (`git clean`, `mv`, `truncate`) gets around it.
- A non-recursive `rm` is not checked, nor is `git rm`.

## What the PRD command needed

PRD §7's `claude` command uses `--permission-mode`, `--settings` (the per-run hook file), `--append-system-prompt` (the agent's system prompt) and `--session-id` (a runner-generated uuid). In the design, the runner, not the adapter, *"writes a per-run `settings.json` with `PreToolUse` hooks"* and the `mcp.json` (`03` §6; PRD §9; the drawio *Runner* card), both Claude-format files.

> [!warning] The shipped code differs
> Decided 2026-10-18 ([[Agent Providers Open Questions]] #4 and #5):
> - `permissionMode` and `systemPrompt` are `RunSpec` fields.
> - The hooks became `guards`, provider-neutral rules that each adapter enforces inside the agent (see *Guards*).
> - No session id goes in; the provider reports it ([[Agent Run Handle And Result]]).
> - No `settings.json` or `mcp.json` is written. Each adapter builds its config in memory: Claude as Agent SDK options, OpenCode as `OPENCODE_CONFIG_CONTENT` and the server's env.

The sandbox tier still travels only implicitly, through `exec.id` / `exec.profile.tier` (backlog 1.1 adds an optional `step_defs.sandbox_profile` override).

## Transforms before launch

> [!info] Design, not built
> Nothing in this section exists on `dev` as of 2026-10-22: there is no `SpecTransform` and no draft mode. `run-agent` launches the spec its YAML describes.

Draft mode is *"a pure function applied before `launch()`"*:

```ts
type SpecTransform = (spec: RunSpec) => RunSpec;
const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });
```

*"Provider-neutral, composable with any future override (force-local-model, cap-budget-globally, pin-a-model for an incident), and it records the *resolved* model/effort on the run so cost stays honest"* (`06` §15). See [[Draft Mode And Spec Transforms]].

Backlog Story 3.5 adds a second transform: *"draft mode and the sandbox profile compose as `RunSpec` transformers."* No source fixes the order of the chain ([[Settings And Plumbing Open Questions]] #10).

## Related

- [[AgentProvider Port]]
- [[Agent Run Handle And Result]]
- [[Run Config Reference]]
- [[Prompt Assembly]]
- [[Capability Negotiation]]
- [[Agent Providers Data Model]]
