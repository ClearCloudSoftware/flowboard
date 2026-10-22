---
tags: [flowboard, analysis, agent-providers, audit]
date: 2026-10-21
---

# Agent Providers Docs Audit

The 33 notes in [[Agent Providers Index|Agent Providers]] checked against the code that implements them. This is an audit only. No note and no code was changed.

> [!check] Fixed 2026-10-22
> Every finding was worked on 2026-10-22 on branch `fix/agent-providers-audit`, which was merged into `dev` the same day. See [[#Fix status]].

What was compared:

- the notes in `docs/FlowBoard/Agent Providers/` on `dev`;
- the code on `feature/agent-providers` at `e24a515`, merged into `dev` as `8917550` (the trees are identical): the `core`, `adapters`, `ask-user` and `cli` packages in `code/flowboard/packages/`;
- the 2026-10-18 plans and specs in `docs/superpowers/`, as context only.

Nine auditors, one per area, listed every checkable claim in their notes and traced it to the code. Eight verifiers then tried to refute every high and medium finding and every claim about code behaviour. Nothing was refuted outright, and 28 findings were corrected. See [[#Method and limits]].

## Short version

- **The notes written during the build are mostly right. The notes written before it are mostly stale.**
  - The six notes written on 2026-10-18 match the code closely. Every `run-agent` field, every example YAML, every exit code and nearly every recorded decision checks out. The Index, Open Questions and Claude Code Adapter were only partly updated, and they are mixed.
  - The 24 notes from 2026-10-15/16, written before any code existed, were never revised when the port changed. Six are stale, nine are mixed, four are design only and five are mostly accurate.
- **One documented safety rule does not hold.** On OpenCode, `permissions.allow: ["*"]` lets the agent run any shell command without `allow_unrestricted_shell: true` and without the warning line, and so do `b*`, `ba?h` and `Bash(?*)`. See 2.1.
- **The guards are both stricter and leakier than the notes say.**
  - The rm rule blocks `rm -rf` of an absolute path inside the folder, but lets `rm -rf $HOME` and `rm -rf ./x ~` through.
  - A write through a link inside the folder lands outside it.
  - `deny_paths` globs skip dot-files and do not cross `/`.
  - See 2.2 and 2.3.
- **OpenCode's isolation is incomplete.**
  - An inherited `OPENCODE_PERMISSION` can loosen the subagents' rules.
  - The server's shell endpoints skip the guard plugin.
  - An `anthropic/...` model with an API key in the environment calls the Anthropic API directly.
  - See 2.4.
- **A stopped or crashed run reports zero usage**, even after it has spent money. See 2.7.
- **Most of the doc drift has one cause.** On 2026-10-18 the port changed:
  - it gained `permissionMode`, `systemPrompt`, `guards`, a `usage` event and `raw`;
  - `pid` became a promise;
  - `stop()`, `RunResult.error` and `ExecHost.spawn` changed;
  - nobody writes `settings.json` or `mcp.json` any more.

  The contract notes still quote the old reference port in `docs/old/reference/`, while the shipped code's header comments send readers to those same notes. See section 3.
- **Scope needs your decision.** The Index, Overview, Roadmap, Codex Adapter and Adding A Provider still say v1 is Claude-only and Codex comes next. OpenCode is the second provider that was built. See 3.4.
- **Numbers.**
  - 923 claims checked, 662 matched (72%).
  - 149 findings. The 111 that mattered were re-checked and all survived: 61 as stated, 28 with corrections.
  - Free suite on the branch: 209 tests, 195 pass, 14 live tests skipped. The typecheck is clean.

## Fix status

Updated 2026-10-22. The fixes were made on branch `fix/agent-providers-audit`, in the worktree `.claude/worktrees/agent-providers-audit`, cut from `dev` at `8917550`. They were committed there and merged into `dev` (`--no-ff`, not pushed) on 2026-10-22.

- **Tests:** the free suite has 226 tests: 212 pass, 14 live tests are skipped, 0 fail. The typecheck is clean. No live test was run.
- **Notes:** all 33 in this folder were corrected against the code. So were 20 notes elsewhere that repeated the same drift:
  - `ChildHandle` and "must not reorder": ExecHost Port, ExecHost Seam, Execution Runtime, Stopping And Cancelling, Prompt Assembly, Recalled Memory In The Prompt, Monitor Open Questions, Sandboxed Run Lifecycle and Sandboxing Data Model;
  - the `tool_hooks` drift: In-Agent Hooks, Sandboxing Open Questions, Sandboxing Roadmap, Agent Launch Contract, Execution Open Questions and four Capability Library notes;
  - Ask User MCP Server, which the shim's code points to;
  - Git Inside A Workspace.

### Code

| Finding | What changed | Code |
|---|---|---|
| 2.1 shell opt-in | On OpenCode the loader asks the adapter, which uses OpenCode's own glob rules. `*`, `b*`, `ba?h` and `Bash(?*)` now need `allow_unrestricted_shell`. Claude names tools exactly in allow rules (checked in the 2.1.302 binary), so `*` there allows nothing. | `opencode/permissions.ts`, `cli/src/config.ts` |
| 2.2 rm guard | Built into the guard and derived from `writeRoots`: a recursive `rm` must stay inside the folder. Absolute paths inside pass. `$HOME`, `~`, `/`, `"/"` and paths outside are refused. Covered: options in any order; literal `cd`; `find -exec`; brace lists; backticks; line continuations; links. `xargs` and a `cd` it cannot follow are refused. | `core/src/guard.ts` |
| 2.3 links, globs | Writes are checked where they land, after following links, and `~/` means home. `deny_paths` matches dot names, and ignores case on macOS and Windows. The dialect is documented: `*` stays in one folder, `**` crosses folders. | `core/src/guard.ts` |
| 2.4 OpenCode isolation | Every inherited `OPENCODE_*` setting is dropped except the two credentials. The Anthropic keys are dropped too. The server's shell and PTY endpoints are documented, not changed. | `opencode/options.ts` |
| 2.5 linked skills | Copied with `fs.cp` and `dereference`. Node 24's `cpSync` ignores `dereference` inside folders. | `cli/src/run.ts` |
| 2.6 queued questions | Batches are numbered and logged when they arrive. The `answer` and `withdrawn` lines carry the batch number. A queued batch that is withdrawn gets its own terminal line. | `cli/src/ask/broker.ts`, `run.ts` |
| 2.7 zero usage | A stopped or failed run keeps the last running usage. On Claude that is tokens only, with no cost. | both `provider.ts` |
| 2.8 | Native packs are applied first, so the adapter's keys win. An explicit deny of the ask tool wins on both adapters. Replay fails on a scripted error. The `costUsd` rule is stated. `numTurns` means the main agent's turns on both providers. "No outcome" and "kill by pid" are documented. | `opencode/*`, `replay-provider.ts`, `events.ts`, both `normalize.ts` |
| Section 4 | Tests remove the temp folders they create. `test:packages` blanks `FLOWBOARD_LIVE`. `/runs/` is git-ignored. | six test files, `package.json`, `.gitignore` |

Found while fixing, and fixed with tests:

- OpenCode's bash `workdir`, and a `cd` that persists between Claude's Bash calls, let a recursive `rm` run outside the folder. The guard now takes the shell's folder from each adapter.
- On macOS, Node's matcher ignored letter case only in wildcards, so `docs/**` missed `DOCS/a.md`.
- The git rules missed `git -C . push` and other global options.
- A code review of the first fixes found further gaps in the new rules, all closed:
  - globs that name a dot file or folder;
  - `cd`, backticks and line continuations;
  - `find -exec`, brace lists, and a link named without a trailing slash.

### Decisions taken, open to your review

Claude took these under "fix all issues". Each is recorded where the notes keep decisions:

| Decision | Recorded in |
|---|---|
| A recursive `rm` must stay inside the write roots, built in with `writeRoots` | C11 |
| Writes are checked after following links; `~/` is the home folder | C13 |
| `deny_paths` keeps Node's matcher; dot names match; case is folded on macOS and Windows | C14 |
| `numTurns` counts the main agent's turns | C15 |
| A stopped or failed run reports the last running usage | C16 |
| Replay fails on a scripted error and rejects a missing session id | C17 |
| The git rules allow git's global options | C18 |
| OpenCode inherits no `OPENCODE_*` setting except the credentials, and no Anthropic key | O17 |
| An explicit deny of the ask tool wins on both adapters | O18 |
| Native packs sit under the adapter's config keys | O19 |
| OpenCode wildcard allow entries need the shell opt-in | R35 |
| Question batches are numbered and logged on arrival | R36 |
| `skills:` folders are copied with links followed | R37 |
| Tests clean up their temp folders; the free suite blanks `FLOWBOARD_LIVE` | R38 |
| `/runs/` is git-ignored | R39 |

[[Agent Providers Open Questions]] records the same decisions under #1, #2, #20, #24 and #31 to #33. It adds #37 for the pid decision.

### Still open

- **Scope (3.4).** Open Questions #38, "Is OpenCode in v1, and is Codex still next?", is yours to decide. The notes now describe what is built and point there.
- **Live checks.**
  - Two items under "Not checked" are settled. Linked skills are now copied as real files. Claude's handling of `allow: ["*"]` was read from the binary.
  - One still needs a live run: whether a real Claude cap hit exits 0.
- **Accepted limits, documented.**
  - The guard reads the command text, so a script, `eval`, `find -delete` or another deleting command (`git clean`, `mv`) gets around it. There is no sandbox tier yet.
  - OpenCode's shell and PTY endpoints skip the guard plugin.
  - `~/.opencode` and admin-managed OpenCode config still load (O9).
- **Drift in other components.** A second pass on 2026-10-22 corrected every provider-layer statement the code contradicts, in 119 notes outside this folder:
  - Execution, Sandboxing, Capability Library and Human In The Loop;
  - Settings And Plumbing, Intake And Import and Projects;
  - Monitor, Task Detail and Workspaces;
  - Cost And Control, Flow Design and Memory.

  The topics were settings and MCP files, CLI flags, the `vibe` server name, `RUN_ID`, `ChildHandle` and stop, the event kinds, line parsing, `/grill-me` as part 4, `args.json`, and Claude-only versus Codex next. Design quotes were kept, with the correction beside them. Unbuilt runner, database, UI and sandbox design was left as design.
- **Found in that pass, for your decision.**
  - **Plugin MCP servers do not start on Claude runs.** The adapter sets `strictMcpConfig: true` to keep your personal MCP servers out of runs, and that also skips a mounted plugin's `.mcp.json`. OpenCode mounts only a plugin's `skills/`. This contradicts Capability Library D8. D9, D15 and the "mount only named plugins" rationale assume plugin MCP servers run.
  - **The backlog importer's design wants an agent with no tools** (`--tools ""`), and `RunSpec` has no field for that.
- **Temp folders.**
  - 4,071 stale folders from this suite were deleted: 658 in `/tmp` and 3,413 in `$TMPDIR`.
  - 409 empty folders from other branches' tests were also removed.
  - About 2,370 non-empty ones remain (`fb-flow-`, `fb-art-`, `fb-folder-`, `fb-log-` and others). They come from `feature/flow-orchestration` and `feature/docker-sandbox` tests, which leak the same way this suite did.

## 1. Note by note

*Design* means last edited on 2026-10-15/16, before the code existed. *Build* means written or updated on 2026-10-18.

| Note | Era | Verdict | Main problems |
|---|---|---|---|
| [[Agent Providers Index]] | build | Mixed | "v1 is Claude-only"; Codex and OpenCode both called "the second real provider"; "seven event kinds" |
| [[Agent Providers Overview]] | design | Stale | Place in the system, diagram and principles 5, 6, 8 and 9 predate OpenCode and the SDK; not marked as design |
| [[Agent Providers Glossary]] | design | Mostly accurate | NormalizedEvent "seven kinds"; OTel naming stated as fact; no GuardRules, PermissionMode, `usage`, shim or broker |
| [[AgentProvider Port]] | design | Mostly accurate | The four members match; the `tool_hooks` "drift" and a ProviderId without `opencode` are stale |
| [[Run Spec]] | design | Mixed | No `permissionMode`, `systemPrompt` or `guards`; "the runner writes settings.json and mcp.json"; "must not reorder" |
| [[Agent Run Handle And Result]] | design | Stale | `pid`, `stop()`, `RunResult.error`, exit codes and the `sessionId` rejection |
| [[Normalized Event Envelope]] | design | Mixed | Eight kinds, not seven; `raw` is optional and parsed; the `costUsd` rule; tool payloads stay provider-shaped |
| [[Provider Capabilities]] | design | Mixed | The `tool_hooks` drift is closed; no OpenCode column; two Claude evidence cells are wrong |
| [[Capability Negotiation]] | design | Design only, unmarked | Nothing reads `provider.capabilities` |
| [[Logical Model Ids]] | design | Mostly accurate | OpenCode's table, pass-through and throw are undocumented; the effort statement is wrong for OpenCode |
| [[Stream Parsing And Normalization]] | design | Mixed | Line-parsing framing; stale sample table; rate limits dropped; failure mapping missing |
| [[Session Resume And Context Replay]] | design | Mixed | The session-id question was decided; plain resume is missing; park and context replay are unbuilt and unmarked |
| [[Providers And Sandboxing]] | design | Mixed | Old ExecHost signature; the permission gate, credential proxy and limits read as built |
| [[Provider Boundary Rules]] | design | Mixed | The settings/mcp row is stale; the neutral vocabulary is Claude's, which it does not say |
| [[Adding A Provider]] | design | Stale | Ignores OpenCode; no conformance suite exists |
| [[Claude Code Adapter]] | design and build | Mixed | The SDK section is accurate; In-agent hooks and Rules the adapter owns are stale; run results and the MCP timeout are missing |
| [[OpenCode Adapter]] | build | Mostly accurate | "Guards still hold" is wrong; env isolation is incomplete; the native merge; the failure contract is missing |
| [[Codex Adapter]] | design | Design only | Still opens with "The second real provider" |
| [[Replay Provider]] | design | Mostly accurate | Self-check and "Where it is used" describe the old copy; it cannot express a failed run |
| [[Agent Client Protocol Option]] | design | Design only | "No outcome recorded" is overtaken by the Fit Analysis |
| [[Provider SDK Fit Analysis]] | build | Mostly accurate | The proposals were never marked as shipped; the OpenCode capability column; the in-process MCP claim |
| [[Provider Implementation Decisions]] | build | Mostly accurate | C11 understates the rm regex; C12's reason ignores the SDK's own SIGKILL; the pid decision is not in Open Questions |
| [[Run Agent CLI Decisions]] | build | Mostly accurate | R10 contradicts R18; R26's copy-not-link fails for links; two stale deferred rows |
| [[Run Config Reference]] | build | Mostly accurate | The wildcard-allow hole; rm wording; plugin naming; the OpenCode subagent limit; the `.env` asymmetry; the glob dialect |
| [[Testing The Run Agent CLI]] | build | Mostly accurate | `FLOWBOARD_OPENCODE_MODEL` gating; log line kinds; the worktree location; the free suite can run paid tests |
| [[Agent Providers Data Model]] | design | Mixed | Types mostly right (ChildHandle gone, new types missing); the database sections are unbuilt and stale |
| [[Agent Providers Runtime]] | design | Stale | Processes, launch, sandbox and stop are PRD design, unmarked |
| [[Agent Providers API And Routes]] | design | Design only, unmarked | None of the routes exist |
| [[Agent Providers Storage]] | design | Stale | The layout paths and per-run files do not exist; `runs/*.jsonl` is not mentioned |
| [[Agent Providers Defaults And Sample Content]] | design | Mixed | "The only real adapter"; the defaults are PRD design; the real defaults are missing |
| [[Agent Providers Roadmap]] | design | Stale | Claude-only; a second provider out of scope; OpenCode, `run-agent` and ask_user absent |
| [[Agent Providers Open Questions]] | build | Mixed | Questions settled by the code are still open; #5 and #9 are written for Claude only |
| [[Agent Providers Sources]] | design | Mostly accurate | Design sources only; does not tell the reference port from the shipped one |

## 2. Where the code should change

These are the findings where the code is at fault, or where it breaks a rule the notes promise. Each was re-checked in round 2 unless marked otherwise.

### 2.1 The shell opt-in can be bypassed on OpenCode (high)

> [!warning]
> [[Run Config Reference]] (Unrestricted shell) and R3 and R4 in [[Run Agent CLI Decisions]] promise that "a setting that lets the agent run any shell command is refused unless `permissions.allow_unrestricted_shell: true`". On OpenCode that is not true.

- The loader knows two triggers (`cli/src/config.ts:77`, `:174-178`):
  - `permissions.mode: bypassPermissions` or `auto`;
  - an allow entry matching `ANY_SHELL`, which is `Bash`, or `Bash(…)` holding only `*`, `:` and spaces.
- The OpenCode adapter turns an allow entry into a permission rule and lowercases unknown names (`adapters/src/agent/opencode/permissions.ts:36-42`). OpenCode matches both the permission and the pattern as globs, and the last match wins.
- So all of these load with no opt-in and no warning line:
  - `allow: ["*"]` becomes `{ permission: "*", pattern: "*", action: "allow" }`. That is the same rule `bypassPermissions` produces (`permissions.ts:48`). Checked in the default `acceptEdits` mode, it allows `bash` with any command, plus edit, webfetch and external_directory.
  - `allow: ["b*"]` or `["ba?h"]` allows `bash` with any command.
  - `allow: ["Bash(?*)"]` passes `ANY_SHELL`, and OpenCode's `?*` matches every non-empty command.
- This was verified with the real loader, the adapter's mapping and OpenCode 1.19.3's own matching code.
- The `deny_commands` regexes still apply, so `git push` stays blocked, but writing outside the folder through the shell is open.
- Fix: decide the trigger from the mapped rules rather than from the entry text. Treat any allow rule whose permission and pattern globs both match `bash` with an arbitrary command as a trigger, and add tests for `*`, `b*`, `ba?h` and `Bash(?*)`.
- Not checked: what Claude does with a bare `*`.

### 2.2 The rm guard blocks more, and less, than documented (medium)

C11 in [[Provider Implementation Decisions]] and the Guards section of [[Run Config Reference]] say the built-in rule blocks a recursive `rm` of `/`, `~` or `..`. The regex (`core/src/guard.ts:10`) actually blocks a recursive `rm` whose first non-option operand starts with `/`, `~` or `..`.

- **Blocked, though harmless:**
  - `rm -rf /<folder>/build`, an absolute path inside the run folder (agents often use absolute paths);
  - `rm -rf /tmp/x`;
  - `rm -rf ~/cache`;
  - `rm -rf ../sibling`.
- **Allowed, though dangerous:**
  - `rm -rf $HOME`;
  - `rm -rf ./x ~`;
  - `rm -r -f ./x /`;
  - `rm -rf "/"`.

  None of these needs the "script or eval" the notes admit to.
- The PRD rule in [[In-Agent Hooks]] was "rm -rf outside the worktree".
- The command rules live in core (`DEFAULT_DENY_COMMANDS`), but only `run-agent` adds them (`cli/src/config.ts:189`). The adapters enforce only what the caller passes. A future runner that passes `{ writeRoots }` alone gets no command blocking, while [[Claude Code Adapter]] (In-agent hooks) still describes built-in rules for destructive commands.
- Decide which rule you want, then make C11, the Reference and the regex agree.

### 2.3 Writes through links, and the deny_paths glob dialect (medium)

- **Links.** The write guard compares path text (`core/src/guard.ts:22`). A Write or Edit through a link inside `folder` that points outside passes "Writes stay in folder", and no note says so.
- **Glob dialect.** `guards.deny_paths` uses Node's `path.matchesGlob` on the folder-relative path (`guard.ts:37`). There `*` does not cross `/`, and both `*` and `**` skip dot-files.
  - `*.lock` protects only lock files at the top of the folder.
  - `secret/**` does not cover `secret/.env`.

  The Reference names no dialect, and scenario 4 in [[Testing The Run Agent CLI]] relies on `secret/**`. Recommend `**/*.lock` and explicit dot-file patterns, or switch to another matcher.
- **Shell writes.** `folder` and `deny_paths` are checked only for file-edit tools: Claude's Write, Edit, MultiEdit and NotebookEdit, and OpenCode's write, edit and apply_patch. A command that an allow rule permits, such as `Bash(git *)`, can write anywhere. The Reference's Unrestricted shell section admits this, but two places overstate it:
  - its `folder` row says "All writes are limited to it";
  - scenario 4 in the testing note promises the deny_paths message without the "if the agent tries" hedge that scenario 3 has.

### 2.4 OpenCode isolation is incomplete (medium)

- **`OPENCODE_PERMISSION` passes through.**
  - `buildLaunch` strips only `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` (`adapters/src/agent/opencode/options.ts:88-89`).
  - OpenCode 1.19.3 deep-merges an inherited `OPENCODE_PERMISSION` into `config.permission`, which is the ruleset subagent sessions run under. So your shell environment can loosen the subagents' rules. The root session is unaffected.
  - The 1.19.3 config loader also reads an org config, a managed config folder and managed preferences, and other `OPENCODE_*` variables pass through. That was seen in the binary but not tested.
- **The server's shell endpoints skip the guard plugin.**
  - [[OpenCode Adapter]] says a run that reads its env can reach its own server, and "Guards still hold (they run in the plugin)". That is true only for tool calls.
  - `POST /session/{id}/shell` and `POST /pty` run commands without `tool.execute.before` and without a permission ask.
  - The env carries `OPENCODE_CONFIG_CONTENT` and `FLOWBOARD_GUARDS` as well as the password.
  - In practice a run already needs shell access to read its env, so the extra exposure is modest. The sentence is still wrong.
- **Anthropic models through OpenCode.**
  - Overview principle 9 and the Roadmap say every model call goes through the `claude` CLI.
  - Nothing on the OpenCode path refuses an `anthropic/...` id: the loader only checks for a `/` (`cli/src/config.ts:163`).
  - Nothing strips `ANTHROPIC_API_KEY` either, although the Claude adapter does (`claude/options.ts:29`).
  - With a key in the environment or in OpenCode's `auth.json`, an OpenCode run calls the Anthropic API directly, going around the decision to use the subscription login. Decide whether that is allowed.

### 2.5 Skills folders that are links stay links (medium)

R26 and the `skills` row of [[Run Config Reference]] say `skills:` folders are copied rather than linked, because both CLIs handle links unreliably. But `run.ts:48` copies with `cpSync(…, { recursive: true })` and no `dereference: true`.

- A `skills:` entry that is itself a link lands in the temp plugin as a link to the original. On this machine, 42 of the 56 entries in `~/.claude/skills` are links.
- Links inside any skill folder stay links.
- Whether either CLI then fails to load such a skill needs a live run, and was not checked.
- Fix: add `dereference: true`.

### 2.6 Questions that never reach the screen are not logged (medium)

R22 says "A question must never disappear silently", and the notes say every batch is logged. But a batch that the agent abandons while it waits behind another batch is dropped without a `question` line.

- `run.ts:143` then writes `{"kind":"withdrawn"}` with no question ids.
- That line lands between the on-screen batch's question and answer, so it reads as belonging to that batch.
- The terminal prints "-- question withdrawn: the agent stopped waiting" for a question you never saw.
- Fix: log each batch when it arrives, and put its id on the withdrawn line.

### 2.7 A stopped or crashed run reports zero usage (medium)

Both providers take `RunResult.usage` only from the `result` event (`claude/provider.ts:99-108`, `opencode/provider.ts:99-109`).

- A run that is stopped, or fails before `result`, settles with zero tokens and no cost, even after costed `usage` events.
- No note says so.
- A cost ledger or budget roll-up that reads `RunResult` would record $0 for a run that spent money.
- Fix, before Cost And Control builds on `RunResult`: carry the last `usage` totals into the stopped or failed result. Claude's live `usage` events carry tokens only, so its cost would still need pricing.

Two verifiers found this in passing. It was checked against the code, but not run through the adversarial round.

### 2.8 Smaller code-side items

| Item | What the code does | Note affected |
|---|---|---|
| Native packs replace config | `opencode/options.ts:77` applies each `native` pack with `Object.assign`. A pack that sets `permission`, `agent`, `experimental`, `mcp` or `plugin` therefore drops, respectively, the subagent rules, the step limits, the MCP no-timeout, the ask_user server or the guard plugin. The last one fails safe. The risk is latent: `run-agent` builds only `plugin_dir` packs. | [[OpenCode Adapter]] says "merged into config" |
| Denying the ask tool | `deny: [mcp__flowboard__ask_user]` removes asking on Claude, where `disallowedTools` wins (`claude/options.ts:60`). It does not on OpenCode, where the injected `flowboard_*` allow comes last. The port comment says no list can lock out HITL, but only OpenCode honours that. | [[Run Config Reference]] says deny always wins |
| Replay cannot fail | A scripted `error` event still settles exit 0 with no `RunResult.error`, and `sessionId` never rejects. A runner tested on Replay never sees a real failure. | [[Replay Provider]], [[Normalized Event Envelope]] |
| No real outcome | Neither real adapter sets `outcome`; only Replay passes one through. Every Claude or OpenCode run ends with `outcome` unset, which the port says parks the step at a human gate. Structured output (Fit Analysis #5) was skipped on purpose, and no note records that. | [[Agent Run Handle And Result]], Open Questions #10 |
| The `costUsd` rule | Claude declares `native_cost`, but its live `usage` events carry no `costUsd`. OpenCode reports 0, not absent, for a model with no listed price. "Absent when the provider lacks native_cost" (`events.ts:15`) is therefore not the real rule. | [[Normalized Event Envelope]] and the code comment |
| Live `numTurns` | Claude's live `usage` events always carry `numTurns: 0`, while OpenCode's count steps. The same field means different things mid-run. | [[Stream Parsing And Normalization]] |
| Kill by pid (seen in passing) | A provider process killed from outside is not reported as a stop. Claude gives exit 1 with "terminated by signal"; OpenCode gives exit 1 with "opencode server ended the run early". This matters for the design's Stop route and [[Monitor Open Questions]] #36. | [[Agent Run Handle And Result]] |

## 3. Why the design-era notes drifted

### 3.1 The port changed; the contract notes did not

The contract notes quote the reference port in `docs/old/reference/core/ports/`. The shipped port in `code/flowboard/packages/core/src/ports/` replaced it on 2026-10-18. Yet the shipped files' header comments send readers back to these notes: `agent-provider.ts:16`, `exec-host.ts:11`, `claude/normalize.ts:5` and `replay-provider.ts:6`. [[Agent Providers Sources]] maps `agent-provider.ts` to the reference file, so a reader cannot tell which file a note means.

| Change | Shipped code | Notes still showing the old form |
|---|---|---|
| `RunSpec` gained `permissionMode`, `systemPrompt` and `guards` (`GuardRules`: `writeRoots`, `denyPaths`, `denyCommands`) | `agent-provider.ts:156-161` | [[Run Spec]] ("None has a RunSpec field"), [[Agent Providers Data Model]], the [[Claude Code Adapter]] flag table |
| `pid` is a `Promise<number>`: -1 if nothing spawned, and for OpenCode the server's pid | `agent-provider.ts:186` | [[Agent Run Handle And Result]], the Data Model class diagram |
| `stop()` aborts the run; the result is `{ exitCode: 130, error: 'stopped' }` only if no result arrived first | `agent-provider.ts:191`, `claude/provider.ts:138`, `opencode/provider.ts:227` | [[Agent Run Handle And Result]], [[Agent Providers Runtime]] ("SIGTERM the child") |
| `RunResult.error` is the provider's own report or the stderr tail, and a set `error` means failed even at exit 0 (Open Questions #33) | `agent-provider.ts:173-178` | [[Agent Run Handle And Result]] ("The port only reports exitCode"), Data Model (`runs.error`) |
| `sessionId` rejects when no id arrives; OpenCode's id comes from session create or fork | `agent-provider.ts:183` | [[Agent Run Handle And Result]], [[Session Resume And Context Replay]] |
| `tool_hooks` is a capability, and both providers enforce `guards` (Open Questions #1) | `agent-provider.ts:47-61` | [[Provider Capabilities]] ("drift"), [[AgentProvider Port]] ("Two sketches") |
| `ProviderId` includes `'opencode'` | `agent-provider.ts:27` | [[AgentProvider Port]], [[Agent Providers Glossary]] |
| An eighth event kind, `usage`, carries running totals, and every kind has an optional `raw` (Open Questions #9) | `events.ts:21-35` | [[Normalized Event Envelope]], the Glossary, the Index |
| `ExecHost.spawn` takes a `NodeJS.ProcessEnv` and returns Node's `ChildProcessWithoutNullStreams`; `ChildHandle` is gone | `exec-host.ts:44-48` | [[Providers And Sandboxing]], the Data Model types table, Runtime |
| "Adapters must not reorder" was dropped. The invocation is fully qualified; Claude moves it first, and OpenCode rewrites it as `Use the "<slug>" skill.` | `agent-provider.ts:77-96` | [[Run Spec]] |
| Each adapter pre-approves every injected tool server, not just ask_user, and policy entries are Claude tool names | `agent-provider.ts:139` | [[Run Spec]] |

[[Provider SDK Fit Analysis]] still lists these changes as proposals:

- #1, #3 and #6 shipped as written.
- #2 shipped as `Promise<number>` rather than as an optional field.
- #4 shipped as `usage` rather than `usage_delta`.
- #5, a structured outcome, was not built.

The shipped `agent-provider.ts` header itself still names `adapters/agent/<claude|codex|replay>/` and a `runner/` (line 5).

`ChildHandle` and the "must not reorder" rule also survive outside this folder. A verifier saw them in passing in the following notes, which were not audited:

- [[ExecHost Port]]
- [[ExecHost Seam]]
- [[Execution Runtime]]
- [[Stopping And Cancelling]]
- [[Prompt Assembly]]
- [[Recalled Memory In The Prompt]]

### 3.2 Nobody writes settings.json or mcp.json

Open Questions #4 (decided 2026-10-18) says each adapter turns `RunSpec.tools` and `guards` into its own configuration, in memory:

- Claude gets SDK `mcpServers` and an in-process `PreToolUse` hook.
- OpenCode gets `OPENCODE_CONFIG_CONTENT` with `mcp` and a guard plugin.

No file is written. `run-agent` gives the shim only `FLOWBOARD_ASK_SOCKET`, and no `RUN_ID`.

These notes still describe a runner that writes Claude-format `settings.json` and `mcp.json`:

- [[Run Spec]]: the warning and the ToolServer section.
- [[Provider Boundary Rules]]: the "What lives where" row and the first "Two placements" warning.
- [[Agent Providers Storage]]: the per-run files.
- [[Agent Providers Runtime]]: the launch sequence and its diagram.
- [[Claude Code Adapter]]: In-agent hooks.
- [[Agent Providers Data Model]].

### 3.3 Sandbox, credential proxy and permission gate read as built

[[Providers And Sandboxing]] and [[Agent Providers Runtime]] describe three things as if they exist:

- a CLI in a sandbox that holds only a dummy key, behind a credential-injecting proxy;
- a runner gate that refuses `bypassPermissions` on the host tier ("a correctness rule, not a suggestion");
- physical limits.

None of it is built, and neither note says so.

As built (decision C6 and the two adapter notes):

- every run is a child process on the host, in the real folder, with your real credentials;
- Claude runs on your subscription login and gets your whole environment except `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`;
- OpenCode uses its `auth.json` and the inherited environment, minus two variables;
- the agent's shell sees all of it.

What protects a run today:

- the unrestricted-shell opt-in (R3; see 2.1 for its hole);
- the default modes: `acceptEdits` in `run-agent` and `dontAsk` in the Claude adapter;
- the in-agent guards.

There is no wall-clock limit, because MCP calls are deliberately unlimited (R20). Turn and budget caps fail the run with provider-specific messages.

[[Claude Code Adapter]] still lists the proxy probe and the dummy-key form. As the Fit Analysis says, that design suits an API key, not a subscription login: a container tier would need a `CLAUDE_CODE_OAUTH_TOKEN` inside the sandbox. That is an open design question, not a bug.

### 3.4 Claude-only, Codex next, but OpenCode was built

- [[Agent Providers Index]]:
  - the intro lists Claude Code, Codex and replay;
  - the callout says "v1 is Claude-only";
  - the adapter list calls both [[OpenCode Adapter]] and [[Codex Adapter]] "the second real provider".
- [[Codex Adapter]] opens with "The second real provider".
- [[Agent Providers Overview]]:
  - the five-ports row and the diagram show Codex as next;
  - principle 8 points "prove it with a second implementation" at Codex;
  - principle 9 says every model call goes through the `claude` CLI.
- [[Agent Providers Roadmap]]:
  - v1 is "Claude-only … no provider column";
  - "A second provider in v1" is out of scope;
  - OpenCode, `run-agent` and ask_user appear nowhere.
- [[Adding A Provider]] never mentions OpenCode and calls Codex the planned second provider.
- [[Agent Providers Defaults And Sample Content]] calls Claude Code "the only real adapter".
- Open Questions #14 ("Moot in v1 (D1)") and #19 (the Codex spike as the port's open validation) rest on the same premise. Yet the OpenCode build already exercised fork-on-resume, per-step native cost and MCP injection.

> [!question] Decision needed
> Is OpenCode in v1, or was it a build to validate the port? Is Codex still next? Update D1, the Roadmap and the notes above to match.

[[Adding A Provider]] should also list what OpenCode actually needed:

- permission rules, plus answering permission requests;
- a guard plugin with tool-name translation;
- server start and stop through ExecHost;
- config isolation;
- a captured stream, a fake server and live tests.

### 3.5 Stream parsing is not line parsing any more

[[Stream Parsing And Normalization]] and the Envelope intro describe parsing stdout lines into `run_events` with a `seq`. That is not how it works now:

- the Claude adapter iterates typed messages from the SDK's `query()`;
- the OpenCode adapter reads SSE events;
- there is no line parsing and no `seq`, because `run_events` belongs to the unbuilt runner;
- an unknown message type produces no event, and a malformed record of a known type throws, which the provider reports as the run's error.

What is still right and what is stale:

- **Still right:** the three Claude parsing fixes are implemented as written, and the stream sample is byte-identical to the test fixture `claude-hello.jsonl`.
- **Stale:** the sample table's "not specified" mappings. #7 decided that hook, status and rate-limit records are dropped, and that `message_start` and `message_delta` become `usage` events.
- **Stale:** the usage mapping marked "inferred, not sourced" is exactly what the code does. It sums `modelUsage`, which includes subagents, and falls back to `result.usage`. Yet #32 is still open.
- **Rate limits:** the note calls `rate_limit_event` "the only native signal" for the rate-limited class. Both adapters drop every rate-limit and retry record. A rate-limited failure therefore reaches a runner only as error text, such as `assistant error: rate_limit`.

### 3.6 Sessions

Open Questions #5 decided that the provider reports the session id:

- Claude takes it from the first `system/init`, and a fork gets a new id.
- OpenCode takes it from the session create or fork response, and emits it as a synthesized `system` event.

[[Session Resume And Context Replay]] still treats this as open.

The note is also out of date in two other ways:

- Both adapters implement a plain resume (`resume` without `fork`), which continues the session in place. The note's table lists only fork and context replay.
- Parking on `no_answer_yet` and the context-replay fallback are not built, and the note does not say so. Instead, MCP timeouts are lifted so that a question waits indefinitely (R20).

No caller passes `resume` yet, and no test covers OpenCode's plain resume.

## 4. Smaller errors in the build-era notes

### [[Run Config Reference]]

- **max_turns row.** It says OpenCode subagents are not limited. Since `365bca2`, the build, plan, general and explore agents all get the step limit, as [[OpenCode Adapter]] and O15 say.
- **plugins row.** It says a plugin's name is its folder name. On Claude, the name is the `name` in `.claude-plugin/plugin.json`. The repo's own fixture is folder `fbecho-plugin` with name `fbecho`, invoked as `/fbecho:echo`.
- **`.env` on OpenCode.** The permission-mode table says OpenCode's read-only tools run. In fact OpenCode asks before reading `*.env` and `*.env.*`, and a headless run refuses that ask unless an explicit `Read(.env)`-style allow covers the file. `bypassPermissions` and `auto` are the exceptions. Claude reads `.env` freely. Add this to "Same YAML, different adapter".
- **Paths.** "Absolute paths are used as written" no longer holds, because `folder` and `plugins` resolve to real paths (R33). `/tmp/x` becomes `/private/tmp/x`, and a write addressed to `/tmp/x/a.md` is refused. The list of relative paths also leaves out `skills`.
- **Asking without a terminal.** The agent does not get an answer; it gets a failed tool call, which is counted in "N tool calls failed". R25 uses the same wording.
- **Guards, "deny wins" and the shell.** See 2.1, 2.2, 2.3 and the ask-tool row in 2.8.

### [[Run Agent CLI Decisions]]

- **R10** still says every prompt ends with "This is a headless run…" and that no ask_user server is mounted. R18 replaced it, so mark R10 as superseded.
- **R26** says a plugin folder named `local` is refused, but it is refused only when `skills:` is non-empty. See also 2.5 on links.
- **R7** says effort is not checked, but the loader rejects anything outside the five levels. R7 seems to mean "not checked against the model's variants" (unverified).
- **Deferred rows.**
  - A free-suite run now leaves 20 empty `/tmp/fb-*` folders, not 14. 627 have piled up on this machine, 182 of them from this audit's test runs.
  - The "no real grill-me run" row is stale, since the testing note and R32 record one on OpenCode. Grill-me on Claude (scenario 13) and the y/n keys are still unconfirmed.

### [[Testing The Run Agent CLI]]

- **Live tests.**
  - `FLOWBOARD_OPENCODE_MODEL` reads as optional, and `pnpm test:live` is said to pass 12.
  - In fact the three OpenCode adapter tests skip without the variable, so a plain `pnpm test:live` runs 9 tests and skips 5.
  - `cli-live` and `ask-live` still spend OpenRouter credit on their default model.
  - [[OpenCode Adapter]], by contrast, sets the variable on the command.
- **The free suite can spend money.** `pnpm test:packages` also globs the four `*-live` files, which skip only because `FLOWBOARD_LIVE` is unset. If it is exported in your shell, the "free" suite runs the paid tests.
- **Reading the logs.** The note lists three line kinds. `run.ts` writes six (`start`, `event`, `question`, `answer`, `withdrawn` and `result`) and adds an `at` field to every line. A run that fails during setup has only a `result` line.
- **"Every field".** `all-fields.yaml` leaves out `plugins`, `skills`, `skill` and `permissions.allow_unrestricted_shell`.
- **Location.** The note still says the code lives in the agent-providers worktree "until a merge". It has been merged. On `dev`, run `pnpm install` in `code/flowboard` first; without it the suite fails there today with `ERR_MODULE_NOT_FOUND`.
- **Node version.** The note does not state one. The suite relies on Node's built-in type stripping (Node 24 here) (unverified).

### [[Provider Implementation Decisions]]

- **C11** understates the rm regex. See 2.2.
- **C12.** Its reason for the SIGKILL holds for OpenCode and for tests with a fake `query()`, but not for Claude.
  - On abort, Agent SDK 0.3.302 already closes stdin, sends SIGTERM 2 s later and SIGKILL 5 s after that.
  - The provider's `terminate()` therefore runs about 2 s after `stop()`, and its default 5 s grace races the SDK's.
  - A `killGraceMs` above 5000 cannot lengthen the grace.
  - The deferred row that calls the abort listener harmless is stale.
- **The pid decision.** The note says "pid as a promise" is recorded in Open Questions. No entry records it.

### [[OpenCode Adapter]]

- "Guards still hold" and env isolation: see 2.4. "Merged into config": see 2.8.
- **model row.** It says "An unknown id fails the run". Any id containing `/` passes through unmapped; only an unmapped id without a `/` throws. `run-agent` relies on that pass-through.
- **One server per run.** The section omits the start and failure contract. See section 5.

### [[Claude Code Adapter]]

- **In-agent hooks** still quotes the PRD's per-run `settings.json` with built-in rules. The adapter registers an in-process `PreToolUse` callback only when `RunSpec.guards` is set, and that callback enforces only the rules the caller passes.
- **Rules the adapter owns** lists capability pins, fully qualified skills and an `args.json` snapshot as adapter rules. The adapter does none of them:
  - `run-agent` rewrites `/name` to `/local:name` for `skills:` folders;
  - the plan gave the snapshot to the runner.

  The "Implemented" callout supersedes only the flag tables.
- Both adapter notes cite `pnpm test:live`, which now runs four suites and spends both subscription quota and OpenRouter credit.

### [[Provider SDK Fit Analysis]]

- "Changes the port needs" is still written as proposals. See 3.1.
- The capability table says OpenCode lacks `plugins`, `permission_modes` and `budget_cap`. `OpencodeProvider` declares all eleven flags, and several are only partly honoured:
  - `plugins` mounts only `<plugin_dir>/skills`, with no check that it loaded;
  - permission modes are emulated with rules and replies;
  - `budget_cap` never trips on a model with no listed price;
  - `partial_stream` drops text deltas;
  - `effort` is an exact variant-name match.
- The Recommendation says in-process `createSdkMcpServer` removes the shim and its socket. The build kept a stdio shim and a broker socket on both providers (R18), and `ToolServer` can only describe a command.

## 5. Behaviour no note describes

- **Exit codes.**
  - A stop before the result gives 130 and `stopped` on all three providers.
  - A binary that cannot be spawned gives 127.
  - An OpenCode server that exits during start-up reports its own exit code, and a 30 s start timeout gives 1.
  - A Claude CLI's own non-zero code passes through, but a signal kill shows as 1, with "terminated by signal" text.
  - Every other OpenCode failure gives 1.
  - Turn and budget caps show only as provider-specific text: `error_max_turns:` and `error_max_budget_usd:` on Claude, `max_turns:` and `max_budget:` on OpenCode. A runner cannot classify them without matching that text.
- **How runs fail.**
  - `RunResult.error` is the first `error` event's message. Claude appends the stderr tail when the SDK threw, and a stop replaces the message with `stopped`.
  - On OpenCode, any assistant-message error or `session.error`, in the root session or in a subagent, fails the run with exit 1, even if the main agent finishes.
  - A `ContextOverflowError` is dropped, because OpenCode compacts and carries on.
  - A failing tool only produces a `tool_result` with `ok: false`.
  - Claude's `is_error` error comes after `result`; OpenCode's limit errors come before it.
- **No MCP time limit, for any server.**
  - Both adapters lift MCP tool-call limits to 2,147,483,647 ms, about 24.8 days. Claude does it through `MCP_TOOL_TIMEOUT` (`claude/options.ts:51`); OpenCode through each server's `timeout` and `experimental.mcp_timeout`.
  - With no run-level wall clock, a hung tool server stalls the run until `stop()`.
  - Only R20 records this.
- **Project instructions are skipped.**
  - Claude's `settingSources: []` (`claude/options.ts:52`) also skips the target folder's `CLAUDE.md` and its `.claude/settings*.json`.
  - OpenCode's `OPENCODE_DISABLE_PROJECT_CONFIG=1` (`opencode/options.ts:93`) skips `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` and `.opencode`.
  - A run therefore never sees the repository's own agent instructions. Put conventions in `system_prompt` or in the prompt file.
- **The OpenCode server contract.**
  - Readiness is the stdout line `opencode server listening on http://…`, and start-up times out after 30 s.
  - A missing binary gives 127.
  - A server that dies mid-run gives 1, with "opencode server ended the run early".
  - The options are `opencodePath`, `env` and `killGraceMs`.
- **Stops.** A stopped or crashed run reports zero usage (2.7). Every Claude abort waits about 2 s, because the SDK closes stdin first.
- **Tool events stay provider-shaped.**
  - `tool_use.name`, `tool_use.input` and `tool_result.output` use each provider's own names and shapes: `Read`, `file_path` and content blocks on Claude; `read`, `filePath` and strings on OpenCode.
  - `summary` keeps the provider's tool name too.
  - So "nothing downstream sees provider JSON" does not hold for tool events.
- **The neutral vocabulary is Claude Code's.**
  - The guard checks only `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash`, and allows any other tool name.
  - `toolPolicy` entries are Claude tool names, and `PermissionMode` is Claude's set of modes.
  - OpenCode translates in its guard plugin and in `TOOL_NAMES`.
  - A new adapter that forgets to translate gets a guard that silently allows everything. [[Adding A Provider]] should say so.
- **Shared code with no note.** The shared tool summary (`adapters/src/agent/summarize.ts`) and the OpenCode normalizer's rules, such as session scoping and skipping synthetic parts, appear in no note.

## 6. Designed but not built

| Note or section | What is missing | Says it is not built? |
|---|---|---|
| [[Capability Negotiation]] | Nothing reads `provider.capabilities`; both real providers declare all eleven flags anyway | No |
| [[Agent Providers API And Routes]] | All six routes and `/runs/[id]`; `app/` is the Next.js starter | No |
| [[Agent Providers Data Model]], database sections | Every table | No |
| [[Agent Providers Runtime]] | `apps/web`, the worker, the sandbox, `apps/mcp-shim`, and the runner's launch steps | No |
| [[Agent Providers Storage]] | Per-run files and `run_events.raw`. The real record is `runs/<timestamp>-<adapter>.jsonl`, which no `.gitignore` covers | No |
| [[Agent Providers Defaults And Sample Content]] | The PRD defaults. The real ones are missing: `acceptEdits` in `run-agent`, `dontAsk` in the Claude adapter, the 5 s kill grace and the 30 s server start | No |
| [[Session Resume And Context Replay]] | Parking, `no_answer_yet`, context replay and the resume-race fix | No |
| [[Providers And Sandboxing]] | The permission gate, the credential proxy, tiers beyond the host, physical limits | No |
| [[Run Spec]], Transforms before launch | Spec transforms and draft mode | No |
| [[Replay Provider]], Self-check and Where it is used | The self-check lives in `adapters/test/replay.test.ts`; Replay is used only as a stand-in in tests | No |
| [[Provider Boundary Rules]], the runner rows | Draft mode, the permission gate, infra retry, PricingService, the registry | No |
| [[AgentProvider Port]], Where the port sits | The runner, the other ports, the worker | No |
| [[Claude Code Adapter]], Milestone | `run_events` storage, the SSE viewer, the runs table | Quotes the PRD |
| [[Codex Adapter]] | Everything | Yes |
| [[Agent Client Protocol Option]] | ACP code, or the spike | Yes, but see section 7 |

One status line per note or section, such as "Design. Not built on `dev` as of 2026-10-21.", would fix most of this.

## 7. Open Questions the code has answered

- **Decided and accurate:** #1, #4, #20 and #33. The same goes for #7, apart from its wording: Claude takes the full text from the `assistant` message and ignores the deltas, rather than "folding" them.
- **Settled by the code but still open:**
  - #3: `RunSpec` carries `exec`.
  - #24: isolation, for the host tier.
  - #31: both capability sets and the mappings are now in code, and the deny flag and live usage exist.
  - #32: the usage mapping.
  - #34: the parsers live in the adapters.
  - #11 and #12: there is no shared logical vocabulary. Claude's `resolveModel` is the identity function, and OpenCode's table is a constructor option that `run-agent` leaves empty.
- **Decided, but worded for Claude only:**
  - #5: OpenCode's id comes from session create or fork.
  - #9: OpenCode emits `usage` per step; `raw` is optional, and missing on errors the adapters raise themselves.
- **Half answered:** #8. The adapters build `summary`, but only for `tool_use`.
- **Overtaken:** #18 and [[Agent Client Protocol Option]] say no outcome is recorded. In fact the Fit Analysis kept the hand-written port, and the branch built it. Record whether ACP is deferred or dropped.
- **Missing:** the pid-as-a-promise decision, and C10's decision to skip `v` for now (#6).
- **Premise changed:** #14 and #19 depend on the scope decision in 3.4.

## 8. Contradictions between notes

- **Codex or OpenCode as "the second real provider".** [[Agent Providers Index]] says both. [[Codex Adapter]] and [[Adding A Provider]] say Codex, against [[OpenCode Adapter]] and [[Claude Code Adapter]].
- **R10 against R18**, both in [[Run Agent CLI Decisions]]. R10 also contradicts [[Run Config Reference]].
- **The max_turns row** in [[Run Config Reference]], against [[OpenCode Adapter]] and O15.
- **`FLOWBOARD_OPENCODE_MODEL`.** It is optional in [[Testing The Run Agent CLI]] but set on the command in [[OpenCode Adapter]].
- **"No real grill-me run"** in [[Run Agent CLI Decisions]], against the testing note and R32.
- **Effort.** [[Logical Model Ids]] says "passed or dropped" and [[Provider SDK Fit Analysis]] says "via variant mapping". Both differ from the code.
- **The replay harness.** [[Replay Provider]] treats the choice as open; Open Questions #20 decided it.
- **ACP.** [[Agent Client Protocol Option]] and #18 say no outcome is recorded, against [[Provider SDK Fit Analysis]].
- **Claude credentials.** [[Claude Code Adapter]]'s proxy and dummy-key form contradicts its own SDK section and the Fit Analysis, which both use the subscription login.
- **The pid decision.** [[Provider Implementation Decisions]] says it is in Open Questions; it is not.
- **Event kinds.** "Seven event kinds" in the Glossary and the Index, against Open Questions #9.

## 9. What holds up

- **The port's shape.**
  - the four members and their signatures;
  - the original ten `RunSpec` fields;
  - the `PromptParts`, `ToolServer`, `CapabilityPack` and `ArtifactRef` types;
  - the eleven capability names;
  - Claude's identity `resolveModel` and Replay's capability set.
- **The Claude adapter's build section.**
  - The "Built on the Agent SDK" table matches `options.ts` row for row.
  - The auth and isolation rules hold: no API key, `pathToClaudeCodeExecutable`, `settingSources: []` and `strictMcpConfig`.
  - The pinned SDK 0.3.302 and CLI 2.1.302 match.
  - Decisions C1 to C10 match, and all five Claude deferred issues are still open, as recorded.
- **The OpenCode adapter.**
  - the run order;
  - the permission rule order and the per-mode replies;
  - the isolation env and the guard plugin;
  - usage summing and the budget cap;
  - decisions O1 to O16 and all five deferred issues.
- **The run config.**
  - Every field in `config.ts`'s strict schema is in [[Run Config Reference]], with the right type, default, validation and error text.
  - Path resolution through `INIT_CWD` and `~` expansion match.
  - Log naming, error ordering, and exit codes 0, 1, 2 and 130 match.
- **The testing guide.**
  - All ten example YAML files load, or fail, exactly as described: `broken.yaml` fails with exactly its four lines, and `shell.yaml` loads once its opt-in line is uncommented.
  - Every scenario's message, header line and exit code matches, and so do the `jq` queries.
  - The free-suite baseline matches.
- **Asking.**
  - the tool names and the closing line;
  - the answering keys and the skip rules;
  - the first-in-first-out queue with held lines;
  - Ctrl+C, SIGTERM and SIGHUP handling;
  - the lifted timeouts and the lenient shim input.
- **The dependency rule.** `core` imports nothing from the adapters or the SDKs.
- **Sources.** All 39 cited design sources exist, and every wikilink in the folder resolves.

## 10. Suggested order of work

1. Close the OpenCode shell opt-in hole (2.1). It is a small loader change with tests.
2. Decide the rm rule and the link policy, then make the regex, C11 and the Reference agree, and name the glob dialect (2.2, 2.3).
3. Tighten OpenCode isolation (2.4):
   - strip `OPENCODE_PERMISSION`, and review the other `OPENCODE_*` and managed-config sources;
   - decide whether `anthropic/...` models may run through OpenCode;
   - correct "Guards still hold".
4. Keep the last usage on stopped and failed runs, before anything bills from `RunResult` (2.7).
5. Repoint the contract notes at the shipped port, and apply the table in 3.1. This is the biggest doc fix, and the code already links to these notes.
6. Make the scope decision in 3.4. Then update the Index, Overview, Roadmap, Codex Adapter, Adding A Provider and Defaults.
7. Mark the design-only notes and sections (section 6).
8. Record the Open Questions the code has answered (section 7).
9. Make the small fixes in section 4, including the suite's leftover temp folders.

## Method and limits

- **Round 1: audit.** Nine auditors each took one area:
  - the port contract;
  - events and sessions;
  - the Claude adapter;
  - the OpenCode adapter;
  - replay, ExecHost, guards and boundaries;
  - the run config and the CLI;
  - asking the owner;
  - the testing guide;
  - the architecture and direction notes.

  Each one read its notes in full, listed every checkable claim and traced it to the code. Result: 923 claims checked, 662 matched, 149 findings.
- **Round 2: verification.** Eight skeptical verifiers tried to refute the 111 findings that were high or medium, or that said something about code behaviour. Duplicates were merged, giving 89 items.
  - Result: 61 confirmed and 28 confirmed with corrections. None was refuted.
  - After re-grading: 3 high, 58 medium and 28 low.
  - This note uses the corrected wording.
- **Evidence.**
  - Free tests and scratch scripts ran in the `agent-providers` worktree only, using the repo's fake CLIs and fake server.
  - The real loader was run on every example YAML.
  - OpenCode 1.19.3's behaviour was read from the installed binary's embedded code, not run.
  - No live test, no `pnpm run-agent`, and no real `claude` or `opencode` process was run.
- **Not verified.**
  - 38 low findings stayed out of round 2, mostly design-not-built and wording. The few used here are marked "unverified".
  - Items that verifiers saw in passing are labelled where they appear. Of these, zero usage on stop was checked against the code.
- **Not checked.** Each of these needs a live run:
  - whether a CLI loads a linked skill;
  - what Claude does with `allow: ["*"]`;
  - whether a real Claude cap hit exits 0.
- **Side effect.** The free tests run during this audit added 182 empty `/tmp/fb-*` folders, which is the known deferred issue. Nothing else was written outside the session's scratch folder.

## Sources

- Notes: `docs/FlowBoard/Agent Providers/`, all 33, on `dev` at `8917550`.
- Code: `code/flowboard/packages/{core,adapters,ask-user,cli}` at `e24a515`, the same tree as `dev`.
- Plans and specs: `docs/superpowers/plans/2026-10-18-*.md` and `docs/superpowers/specs/2026-10-18-*.md`.
- Installed versions: `@anthropic-ai/claude-agent-sdk` 0.3.302 (CLI 2.1.302) and `opencode` 1.19.3.
- Free suite and typecheck in `.claude/worktrees/agent-providers`: 209 tests, 195 pass, 14 skipped; typecheck clean.
