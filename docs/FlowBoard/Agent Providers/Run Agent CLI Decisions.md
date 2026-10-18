---
tags: [flowboard, agent-providers, decisions, implementation, cli]
module: Agent Providers
date: 2026-10-18
---

# Run Agent CLI Decisions

The calls made while building `pnpm run-agent <task.yaml>` on 2026-10-18, and the review findings left for later. The command reads one YAML file, launches the [[Claude Code Adapter]] or the [[OpenCode Adapter]] in the folder it names, prints the events live and appends them to `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`. It replaces the old `packages/adapters/try.ts` driver.

Code: `code/flowboard/packages/cli/src/` (`config.ts`, `run.ts`, `main.ts`), on branch `feature/agent-providers`. Built from `docs/superpowers/specs/2026-10-18-yaml-run-config-design.md` and `docs/superpowers/plans/2026-10-18-yaml-run-config.md`, then checked by an independent review. The review's two important findings were fixed test-first before this note was written. The provider decisions are in [[Provider Implementation Decisions]].

## Decisions

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| R1 | One YAML file is one run; the prompt lives in a separate markdown file; the agent works in the `folder` the YAML names, not a throwaway one | The owner's decisions | Several runs or seeded files need new fields |
| R2 | Every relative path (the YAML argument, `folder`, `prompt`, `plugins`, `runs/`) resolves against the folder the command was run from, via pnpm's `INIT_CWD` | The owner's decision | The same YAML points elsewhere when run from another folder |
| R3 | A setting that lets the agent run any shell command is refused unless `permissions.allow_unrestricted_shell: true` | The owner's decision; the guards only restrict file-editing tools (decision C5 in [[Provider Implementation Decisions]]) | None |
| R4 | The triggers for R3 are `bypassPermissions` or `auto` mode, and an allow entry of `Bash` whose pattern holds only `*`, `:` and spaces (`Bash(*)`, `Bash(:*)`, `Bash(**)`, any case). A narrower pattern such as `Bash(pnpm *)` is trusted as written | The review found the first, narrower regex was sidestepped by `Bash(:*)` | A pattern that allows a command which itself writes elsewhere needs no opt-in |
| R5 | With the opt-in set, the header prints one warning line | Keeps the risk visible on every run | None |
| R6 | The package is `packages/cli` (`@flowboard/cli`), not `runner` | The architecture rule reserves `runner/` and forbids it from importing adapters | A rename |
| R7 | `effort` is passed through and not checked | OpenCode drops an effort the model has no variant for, and that is only known once the server is up | A run silently uses the default effort |
| R8 | `permissions.mode` defaults to `acceptEdits` | Matches the old `try.ts` | A run asks (and is refused) more often than the owner expects |
| R9 | A bad config or a bad command line exits with code 2 without launching; a stopped run exits 130; any other failure exits 1 | 2 separates "fix your YAML" from "the run failed" | None |
| R10 | The prompt always ends with *"This is a headless run: there is no terminal to ask into. Do the task, then stop."* | No `ask_user` server is mounted by this command | The agent may still try to ask |
| R11 | A leading `~/` expands to the home folder | Hand-written YAML uses it | None |
| R12 | A log name already taken in the same second gets `-2`, `-3`, … | Two quick runs must not share a log | None |
| R13 | Two Ctrl+C signals within 300 ms count as one press | Under `pnpm run-agent` one press arrives twice (the terminal's group signal plus pnpm's forward), which took the "exit now" path and lost the log's result line | A real double press faster than 300 ms is treated as one |
| R14 | The runner does not touch `.gitignore` | Ignoring `runs/` is the owner's choice | Logs can be committed by accident |
| R15 | The final review covered only this feature's commits, not the whole branch | The provider commits were reviewed under their own plans | Provider code was not looked at again as part of this change |
| R16 | OpenCode running out of steps fails the run with `max_turns: reached the limit of N steps`, when the main agent's step before its last still wanted tools | OpenCode takes the tools away on the last step, the agent writes a summary, and the session ends without an error, so a stuck run exited 0. Claude already fails such a run. Found on a real run that never wrote its file | A run that was really finished on its second-to-last step but called a tool once more is marked failed |
| R17 | The runner prints `-- N tool calls failed` and `-- last message: …` before the result | A run can finish cleanly without doing the task; refused tool calls were only visible by reading every event line | None |
| R18 | The agent asks through an `ask_user` / `ask_user_batch` tool program (`packages/ask-user`), and `run-agent` answers over a private Unix socket per run | FlowBoard's design splits asking into a tool the agent sees and a listener; building the tool as designed means the web inbox and Slack later replace only the listener | None |
| R19 | The tool passes any reply it does not recognise straight to the agent | The worker's later "no answer yet, save your place" reply then needs no change to the tool | An unexpected reply reaches the agent as-is |
| R20 | The run waits for an answer forever; the adapters lift their tool-call limits (`MCP_TOOL_TIMEOUT` for Claude, `mcp.<name>.timeout` and `experimental.mcp_timeout` for OpenCode) to about 24.8 days | The owner's decision: no timeout. Checked live with a six-minute wait on both adapters | A wait past 24.8 days is cut off |
| R21 | Optional questions are skipped with an empty answer (text, number), a `Skip` entry (yes/no, pick one) or nothing ticked (pick several); a required pick-several needs a tick | An arrow-key list always has something highlighted, so it needs an explicit skip | None |
| R22 | A question whose agent stops waiting is taken down with `-- question withdrawn: the agent stopped waiting` and logged | A question must never disappear silently | None |
| R23 | Batches are answered one at a time, first in, first out; event lines that arrive meanwhile wait and print afterwards | Claude can ask from parallel calls and helpers; lines printed over a prompt garble it | Held lines print late |
| R24 | Claude's `AskUserQuestion` is denied in every Claude run | The agent must ask through `ask_user`, the one tool that works everywhere | None |
| R25 | Without a terminal, every question is answered with *"No one can answer questions in this run."* | The agent carries on instead of hanging | None |
| R26 | `skills:` folders are copied (not linked) into a temporary plugin named `local` under `/tmp`, by its real path; `/<name>` becomes `/local:<name>`; a `SKILL.md` name must match its folder; a plugin folder named `local` is refused | The owner's grill-me is a standalone skill; both CLIs and the plugin-loaded check handle links unreliably; OpenCode may load skills by their `name:` | A skill edited mid-run is not picked up until the next run |
| R27 | `y` / `n` on yes/no questions work through the list's type-ahead, so they need Enter; option numbers work directly | The prompt library offers both without custom key handling | One extra key press |

## Deferred issues

| Issue | Effect | Where |
|---|---|---|
| An unreadable prompt file (no read permission) is not caught | A stack trace instead of a `prompt:` error line | `cli/src/config.ts` |
| `runs` existing as a file is not caught | A stack trace instead of an error line | `cli/src/run.ts` |
| An unquoted `folder: ~` is YAML's null value | Validation says *expected string, received null*; only a quoted `"~"` or `~/x` expands | `cli/src/config.ts` |
| A provider result that fails after its event stream already failed is never handled | Node reports an unhandled rejection after the log's result line is written. Neither real provider does this today | `cli/src/run.ts` |
| `pnpm run-agent` prints a pnpm *Command failed with exit code …* banner after every non-zero exit | Noise after a bad config, a failure or a stop; `pnpm -s run-agent` hides it | `package.json` script |
| Schema errors (unknown key, wrong type) are reported before the file and folder checks run | A YAML with both kinds of mistake needs two runs to see them all | `cli/src/config.ts` |
| With `max_turns: 1` on OpenCode, R16 never fires | There is no earlier step to tell a cut-off run from a finished one, so the run always passes | `opencode/provider.ts` |
| A run cannot say which files it must produce | Exit 0 still does not prove the task was done; an `expect_files`-style check was offered and not chosen for now | `cli/src/config.ts`, `cli/src/run.ts` |
| The answering keys (`y`/`n`, option numbers, Space to tick) and a real grill-me run have not been tried by hand | The prompts are tested with fakes only | Manual: scenario 13 in [[Testing The Run Agent CLI]] |
| A single Ctrl+C through `pnpm run-agent` on a real run has not been checked by hand | The 300 ms fix (R13) is tested with simulated signals only | Manual check: a cheap haiku run, one Ctrl+C, expect exit 130 and a final `result` line in the log |

## Related

- [[Run Config Reference]]
- [[Testing The Run Agent CLI]]
- [[Provider Implementation Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
