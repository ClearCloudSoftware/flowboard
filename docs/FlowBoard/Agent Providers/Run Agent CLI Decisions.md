---
tags: [flowboard, agent-providers, decisions, implementation, cli]
module: Agent Providers
date: 2026-10-18
---

# Run Agent CLI Decisions

The calls made while building `pnpm run-agent <task.yaml>` on 2026-10-18, and the review findings left for later. The command reads one YAML file, launches the [[Claude Code Adapter]] or the [[OpenCode Adapter]] in the folder it names, prints the events live and appends them to `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`. It replaces the old `packages/adapters/try.ts` driver.

Code: `code/flowboard/packages/cli/src/` (`config.ts`, `run.ts`, `main.ts`, `ask/`), built on branch `feature/agent-providers` and merged into `dev` on 2026-10-19. Built from `docs/superpowers/specs/2026-10-18-yaml-run-config-design.md` and `docs/superpowers/plans/2026-10-18-yaml-run-config.md`, then checked by an independent review. The review's two important findings were fixed test-first before this note was written. The provider decisions are in [[Provider Implementation Decisions]].

> [!check] Changed 2026-10-22
> R35 to R39 are Claude's decisions of 2026-10-22, taken while fixing a docs-and-code audit; Alex has not reviewed them. The same day, rows that no longer matched the code were corrected (R2, R3, R4, R7, R10, R14, R22, R25, R26, R33) and the deferred issues updated.

## Decisions

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| R1 | One YAML file is one run; the prompt lives in a separate markdown file; the agent works in the `folder` the YAML names, not a throwaway one | The owner's decisions | Several runs or seeded files need new fields |
| R2 | Every relative path (the YAML argument, `folder`, `prompt`, `plugins`, `skills`, `runs/`) resolves against the folder the command was run from, via pnpm's `INIT_CWD` | The owner's decision | The same YAML points elsewhere when run from another folder |
| R3 | A setting that lets the agent run any shell command is refused unless `permissions.allow_unrestricted_shell: true` | The owner's decision; the guards only restrict file-editing tools and recursive `rm` (decisions C5 and C11 in [[Provider Implementation Decisions]]) | None |
| R4 | The triggers for R3 are `bypassPermissions` or `auto` mode, and an allow entry of `Bash` whose pattern holds only `*`, `:` and spaces (`Bash(*)`, `Bash(:*)`, `Bash(**)`, any case); on OpenCode, also the entries in R35. A narrower pattern such as `Bash(pnpm *)` is trusted as written | The review found the first, narrower regex was sidestepped by `Bash(:*)` | A pattern that allows a command which itself writes elsewhere needs no opt-in |
| R5 | With the opt-in set, the header prints one warning line | Keeps the risk visible on every run | None |
| R6 | The package is `packages/cli` (`@flowboard/cli`), not `runner` | The architecture rule reserves `runner/` and forbids it from importing adapters | A rename |
| R7 | `effort` must be one of the five levels (`low` to `max`), but it is not checked against the model | OpenCode drops an effort the model has no variant for, and that is only known once the server is up | A run silently uses the default effort |
| R8 | `permissions.mode` defaults to `acceptEdits` | Matches the old `try.ts` | A run asks (and is refused) more often than the owner expects |
| R9 | A bad config or a bad command line exits with code 2 without launching; a stopped run exits 130; any other failure exits 1 | 2 separates "fix your YAML" from "the run failed" | None |
| R10 | ~~The prompt always ends with *"This is a headless run: there is no terminal to ask into. Do the task, then stop."*~~ Superseded by R18: every prompt now ends with the closing line in [[Run Config Reference]] (`prompt`), which tells the agent to ask with `ask_user` | ~~No `ask_user` server is mounted by this command~~ | ~~The agent may still try to ask~~ |
| R11 | A leading `~/` expands to the home folder | Hand-written YAML uses it | None |
| R12 | A log name already taken in the same second gets `-2`, `-3`, … | Two quick runs must not share a log | None |
| R13 | Two Ctrl+C signals within 300 ms count as one press | Under `pnpm run-agent` one press arrives twice (the terminal's group signal plus pnpm's forward), which took the "exit now" path and lost the log's result line | A real double press faster than 300 ms is treated as one |
| R14 | The runner does not touch `.gitignore` | Ignoring `runs/` is the owner's choice. Since R39 the repo ignores `code/flowboard/runs/` | Logs in a `runs/` folder elsewhere can be committed by accident |
| R15 | The final review covered only this feature's commits, not the whole branch | The provider commits were reviewed under their own plans | Provider code was not looked at again as part of this change |
| R16 | OpenCode running out of steps fails the run with `max_turns: reached the limit of N steps`, when the main agent's step before its last still wanted tools | OpenCode takes the tools away on the last step, the agent writes a summary, and the session ends without an error, so a stuck run exited 0. Claude already fails such a run. Found on a real run that never wrote its file | A run that was really finished on its second-to-last step but called a tool once more is marked failed |
| R17 | The runner prints `-- N tool calls failed` and `-- last message: …` before the result | A run can finish cleanly without doing the task; refused tool calls were only visible by reading every event line | None |
| R18 | The agent asks through an `ask_user` / `ask_user_batch` tool program (`packages/ask-user`), and `run-agent` answers over a private Unix socket per run | FlowBoard's design splits asking into a tool the agent sees and a listener; building the tool as designed means the web inbox and Slack later replace only the listener | None |
| R19 | The tool passes any reply it does not recognise straight to the agent | The worker's later "no answer yet, save your place" reply then needs no change to the tool | An unexpected reply reaches the agent as-is |
| R20 | The run waits for an answer forever; the adapters lift their tool-call limits (`MCP_TOOL_TIMEOUT` for Claude, `mcp.<name>.timeout` and `experimental.mcp_timeout` for OpenCode) to about 24.8 days | The owner's decision: no timeout. Checked live with a six-minute wait on both adapters | A wait past 24.8 days is cut off |
| R21 | Optional questions are skipped with an empty answer (text, number), a `Skip` entry (yes/no, pick one) or nothing ticked (pick several); a required pick-several needs a tick | An arrow-key list always has something highlighted, so it needs an explicit skip | None |
| R22 | A question whose agent stops waiting is taken down with `-- question withdrawn: the agent stopped waiting` and logged; a batch withdrawn while still queued is covered by R36 | A question must never disappear silently | None |
| R23 | Batches are answered one at a time, first in, first out; event lines that arrive meanwhile wait and print afterwards | Claude can ask from parallel calls and helpers; lines printed over a prompt garble it | Held lines print late |
| R24 | Claude's `AskUserQuestion` is denied in every Claude run | The agent must ask through `ask_user`, the one tool that works everywhere | None |
| R25 | Without a terminal, every question fails with *"No one can answer questions in this run."*: the agent gets a failed tool call, counted in `-- N tool calls failed` | The agent carries on instead of hanging | None |
| R26 | `skills:` folders are copied (not linked), with links followed (R37), into a temporary plugin named `local` under `/tmp`, by its real path; `/<name>` becomes `/local:<name>`; a `SKILL.md` name must match its folder; while `skills:` is not empty, a plugin folder named `local` is refused | The owner's grill-me is a standalone skill; both CLIs and the plugin-loaded check handle links unreliably; OpenCode may load skills by their `name:` | A skill edited mid-run is not picked up until the next run |
| R27 | `y` / `n` on yes/no questions work through the list's type-ahead, and typing an option's number moves the cursor to it; both need Enter to confirm | The prompt library offers both without custom key handling | One extra key press |
| R28 | The `local` skills plugin has no `.claude-plugin/plugin.json` | A live run on both adapters loaded it and invoked its skill without one | A future Claude Code version that requires a manifest fails the run with *plugin not loaded* |
| R29 | Closing the terminal (SIGHUP) or a kill (SIGTERM) stops the run like Ctrl+C; the second Ctrl+C deletes the temp folder before exiting | The review found both paths left the temp folder, with a full copy of each skill, behind | None |
| R30 | A withdrawn line waits, like event lines, while another question is on screen | The review found it printed over the open prompt when parallel questions were queued | None |
| R31 | The final review covered only this feature's commits (`bd6027b..`) | Earlier branch work was reviewed under its own plans | Earlier code not re-reviewed here |
| R32 | The question tool also accepts a question sent as JSON text, options sent as JSON text, and a plain-text `question` with `id` and `kind` beside it; a plain-text question without them gets *"a question given as plain text also needs id and kind"* | A real run on `dots-3-note-preview` got its first `ask_user` call rejected every time for this shape, wasting a step | The advertised tool schema is looser, so a model may pick the flat shape on purpose; it works either way |
| R33 | `folder` and `plugins` resolve to their real paths (links followed) after the directory check | Found in a hand test on 2026-10-18: `folder: /tmp/fb-test` blocked every write, because on macOS `/tmp` is a link to `/private/tmp`, the agent's CLI wrote to the resolved path, and the write guard compared path text. Since 2026-10-22 the guard follows links itself (C13 in [[Provider Implementation Decisions]]) | None |
| R34 | Setup failures are reported, not thrown: an unreadable prompt is `prompt: cannot read: …` (exit 2); `runs` that cannot be created is `runs: cannot create the log: …` (exit 2, nothing created); a temp folder, socket or skills copy that fails ends the log and the output with a result `cannot set up the run: …` (exit 1) | A stack trace says nothing to someone running a YAML file | None |
| R35 | (2026-10-22) On `adapter: opencode`, an allow entry is also an R3 trigger when, mapped as the adapter maps it, its tool name globs to `bash` under OpenCode's own matcher (`*`, `b*`, `ba?h`, `B*`, `*(*)`) and its pattern is made only of `*`, `?` and spaces with at least one `*` (`Bash(?*)`, `Bash(??*)`). `Bash(git *)`, `Bash(?)`, `w*` and `Read` are not. The adapter decides (`allowsAnyShell` in `opencode/permissions.ts`); the Claude rule in R4 is unchanged | OpenCode matches both the tool name and the pattern as globs, so `allow: ["*"]` gave the same rule as `bypassPermissions`, and `b*`, `ba?h` and `Bash(?*)` allowed any command, all with no opt-in and no warning. Claude Code 2.1.302 matches allow rules by exact tool name (it globs names only in deny and ask rules), so `*` or `b*` allows nothing there | The check copies OpenCode 1.19.3's matcher; a later version that matches differently could let an entry through |
| R36 | (2026-10-22) Each question batch is numbered within the run (`batch: 1, 2, …`) and logged as a `question` line when it arrives, even while it waits behind another batch; its `answer` or `withdrawn` line carries the same `batch`. A batch withdrawn while queued prints `-- question withdrawn before it was shown: the agent stopped waiting`; one withdrawn while on screen still prints the R22 line | A batch the agent gave up on while it waited behind another was dropped with no `question` line, and its `{"kind":"withdrawn"}` line, with no ids, read as belonging to the batch on screen | None |
| R37 | (2026-10-22) `skills:` folders are copied with Node's async `fs.cp(…, { recursive: true, dereference: true })`: an entry that is itself a link, and links inside the folder, become real files | `cpSync` without `dereference` kept links, so a linked skill landed in the temp plugin as a link to the original, against R26; 42 of the 56 entries in `~/.claude/skills` on this machine are links. Node 24's `cpSync` ignores `dereference` for links inside a folder | A skill that links to a large tree is copied in full on every run |
| R38 | (2026-10-22) `pnpm test:packages` runs `FLOWBOARD_LIVE= node --test …`, so an exported `FLOWBOARD_LIVE` cannot make the free suite run the paid tests (they still match its glob and show as skipped). Every free test file removes the temp folders it creates | The four `*-live` files skipped only because `FLOWBOARD_LIVE` was unset. Each free run also left about 20 empty `/tmp/fb-*` folders and more under `$TMPDIR` (a deferred issue, now closed) | None |
| R39 | (2026-10-22) `code/flowboard/.gitignore` ignores `/runs/`, anchored: only `code/flowboard/runs/`, where the logs land when the command runs from `code/flowboard`. The runner itself still never edits a `.gitignore` (R14) | Run logs hold prompts, answers and raw events | A log meant for the repo needs `git add -f`; a `runs/` folder anywhere else is not covered |

## Deferred issues

| Issue | Effect | Where |
|---|---|---|
| An unquoted `folder: ~` is YAML's null value | Validation says *expected string, received null*; only a quoted `"~"` or `~/x` expands | `cli/src/config.ts` |
| A provider result that fails after its event stream already failed is never handled | Node reports an unhandled rejection after the log's result line is written. Neither real provider does this today | `cli/src/run.ts` |
| `pnpm run-agent` prints a pnpm *Command failed with exit code …* banner after every non-zero exit | Noise after a bad config, a failure or a stop; `pnpm -s run-agent` hides it | `package.json` script |
| Schema errors (unknown key, wrong type) are reported before the file and folder checks run | A YAML with both kinds of mistake needs two runs to see them all | `cli/src/config.ts` |
| With `max_turns: 1` on OpenCode, R16 never fires | There is no earlier step to tell a cut-off run from a finished one, so the run always passes | `opencode/provider.ts` |
| A run cannot say which files it must produce | Exit 0 still does not prove the task was done; an `expect_files`-style check was offered and not chosen for now | `cli/src/config.ts`, `cli/src/run.ts` |
| The answering keys (`y`/`n`, option numbers, Space to tick) and a grill-me run on Claude have not been tried by hand | The prompts are tested with fakes only. A real grill-me run on OpenCode worked on 2026-10-18 (R32, and *Testing with free models* in [[Testing The Run Agent CLI]]) | Manual: scenario 13 in [[Testing The Run Agent CLI]] |
| `NO_TIME_LIMIT_MS` is defined in the Claude adapter and imported by the OpenCode one | A cross-adapter import; the future worker broker will want the same value | `adapters/src/agent/claude/options.ts`, `opencode/options.ts`; move to `@flowboard/core` |
| The broker only checks that `questions` is a list | A malformed request from anything other than the shim is logged as a question and fails in the answerer; the worker broker, as the database writer, will need `checkQuestions` itself | `cli/src/ask/broker.ts` |
| A request arriving in the instant between `close()` waiting for the open question and the socket closing can start a prompt | A withdrawn line may print after `-- result` | `cli/src/ask/broker.ts` |
| A single Ctrl+C through `pnpm run-agent` on a real run has not been checked by hand | The 300 ms fix (R13) is tested with simulated signals only | Manual check: a cheap haiku run, one Ctrl+C, expect exit 130 and a final `result` line in the log |

## Related

- [[Run Config Reference]]
- [[Testing The Run Agent CLI]]
- [[Provider Implementation Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
