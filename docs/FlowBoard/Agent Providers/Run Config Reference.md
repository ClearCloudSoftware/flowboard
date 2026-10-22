---
tags: [flowboard, agent-providers, reference, cli]
module: Agent Providers
date: 2026-10-18
---

# Run Config Reference

Every field of the YAML file that `pnpm run-agent <task.yaml>` reads: what it means, its type and default, how it is checked, and how it behaves on each adapter. One file describes one run. How to try it out is in [[Testing The Run Agent CLI]]; why the rules are what they are is in [[Run Agent CLI Decisions]].

Code: `code/flowboard/packages/cli/src/config.ts`.

> [!check] Changed 2026-10-22
> These changed: the recursive-`rm` rule, writes through links or to `~/`, dot-files and letter case in `deny_paths`, the built-in `git` rules, the shell opt-in on OpenCode, denying the ask tools, the question log, how `skills:` copies links, and the git-ignored `runs/`. Claude decided them on 2026-10-22, and they are open to Alex's review: R35 to R37 and R39 in [[Run Agent CLI Decisions]]; C11, C13, C14, C18 and O18 in [[Provider Implementation Decisions]].

## At a glance

```yaml
adapter: claude-code          # required
model: sonnet                 # required
effort: high
folder: proj                  # required
prompt: task.md               # required
system_prompt: You are a careful engineer.
plugins: [plugins/my-plugin]
skills: [~/my-skills/grill-me]
skill: /grill-me                # or /my-plugin:my-skill
permissions:
  mode: acceptEdits
  allow: [Read, Write, "Bash(pnpm *)"]
  deny: [WebFetch]
  allow_unrestricted_shell: false
guards:
  deny_paths: ["docs/**"]
  deny_commands: ['\bnpm\s+publish\b']
limits:
  budget_usd: 0.50
  max_turns: 20
```

## Rules for the whole file

- **Keys** are snake_case and case-sensitive. A key the reference does not list, at any level, is an error (`task.yaml: colour: unknown key`), so a typo never runs silently with a default.
- **The root** must be a mapping. An empty file, a list or a single value is an error.
- **Relative paths** (`folder`, `prompt`, `plugins`, `skills`, and the YAML path given on the command line) resolve against the folder you ran the command from, not the YAML file's folder. A leading `~/` means your home folder; write a bare home folder as `"~"` in quotes, because unquoted `~` is YAML's empty value.
- **Real paths.** `folder` and `plugins` are then resolved to their real paths, with links followed: on macOS `folder: /tmp/x` runs in `/private/tmp/x`. The guards follow links too, so the agent may still write to `/tmp/x/a.md`.
- **The log** goes into `runs/` in the folder you ran the command from, named `<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`. It holds your prompts, your answers and the raw events. `code/flowboard/.gitignore` ignores only `code/flowboard/runs/`, the log folder when you run from `code/flowboard`; anywhere else, ignore `runs/` yourself.
- **Errors** are printed one per line as `<yaml path>: <field>: <message>`, and the command exits with code 2 before anything launches. Type and unknown-key errors are reported first; the file, folder and rule checks run once those are fixed.
- **Secrets** never go in the YAML. Claude uses your `claude` login; OpenCode uses its own stored credentials. Neither adapter passes an exported `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` on to the run.

## Fields

| Field | Type | Required | Default | Checked | Meaning |
|---|---|---|---|---|---|
| `adapter` | `claude-code` \| `opencode` | yes | | one of the two | Which provider runs the task |
| `model` | string | yes | | `opencode`: must contain `/` | The model. Claude: an alias (`haiku`, `sonnet`, `opus`) or a full model id. OpenCode: `providerID/modelID`, e.g. `openrouter/deepseek/deepseek-v4.1-flash` |
| `effort` | `low` \| `medium` \| `high` \| `xhigh` \| `max` | no | the model's own | one of the five | How hard the model thinks |
| `folder` | path | yes | | an existing directory; resolved to its real path | Where the agent works. File edits and recursive `rm` are limited to it; other shell commands are not (see *Guards* and *Unrestricted shell*) |
| `prompt` | path | yes | | an existing file; not blank unless `skill` is set | Markdown file holding the task. Its text is the task; the runner adds a fixed closing line: *"You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop."* |
| `system_prompt` | string | no | none | | Extra instructions for the agent's system prompt |
| `plugins` | list of paths | no | none | each an existing directory, resolved to its real path; with `skills` set, none may be named `local` | Plugin folders whose skills the agent can use. On Claude a plugin's name, the `<plugin>` in `skill: /<plugin>:<skill>`, is the `name` in its `.claude-plugin/plugin.json`, not the folder name: the test fixture folder `fbecho-plugin` is named `fbecho`, so its skill is `/fbecho:echo` |
| `skills` | list of paths | no | none | each an existing directory with a `SKILL.md` whose `name:` equals the folder name; no two with the same name | Standalone skill folders. Each run copies them into a temporary plugin named `local`. A link, whether it is the folder itself or something inside it, is copied as what it points to |
| `skill` | string | no | none | starts with `/`; a plain `/<name>` must be one of `skills` | A skill to invoke: `/<plugin>:<skill>` for a plugin skill, or `/<name>` for one from `skills`. With a skill set, the prompt file may be empty |
| `permissions.mode` | see *Permission modes* | no | `acceptEdits` | one of the six; see *Unrestricted shell* | How tool calls that need approval are handled, with no one there to approve |
| `permissions.allow` | list of tool rules | no | none | see *Unrestricted shell* | Tools the agent may use without asking. `Read`, `Write`, `Edit`, `Bash`, `Bash(<pattern>)`, `WebFetch`, `mcp__<server>__<tool>`, … |
| `permissions.deny` | list of tool rules | no | none | | Tools the agent may never use. Wins over `allow` on both adapters, and over the ask tools (see *Asking the owner*) |
| `permissions.allow_unrestricted_shell` | boolean | no | `false` | | Opt-in that lets a setting giving the agent any shell command go ahead |
| `guards.deny_paths` | list of globs | no | none | | Paths inside `folder` that file edits may not touch, as globs relative to `folder` (`docs/**`, `**/*.lock`). See *Guards* for how they match |
| `guards.deny_commands` | list of regexes | no | none | each compiles as a regex | Shell commands to block, added to the built-in list |
| `limits.budget_usd` | number | no | no cap | greater than 0 | Stop the run once it has cost this many US dollars |
| `limits.max_turns` | whole number | no | the provider's own | greater than 0 | Stop after this many agent turns |

## Asking the owner

Every run gives the agent two tools, `ask_user` (one question) and `ask_user_batch` (several), and the closing line tells it to use them. No `allow` list can take them away. An explicit `deny` can, on both adapters: `mcp__flowboard__ask_user`, `mcp__flowboard__ask_user_batch`, `mcp__flowboard__*` or `*`.

When the agent asks, the event lines pause and the question appears in the terminal:

| Question type | How to answer |
|---|---|
| yes / no | arrow keys and Enter, or type `y` / `n` then Enter |
| pick one | arrow keys and Enter, or type the option's number then Enter |
| pick several | arrow keys to move, Space to tick, Enter to finish |
| text | type, Enter |
| number | type a number, Enter; anything else asks again |

- A batch comes one question at a time, labelled `question 2 of 4`.
- An optional question can be skipped: an empty answer for text and numbers, the `Skip` entry for yes/no and pick-one, nothing ticked for pick-several. A required one cannot.
- The run waits as long as you take; waiting spends no quota or credit. Both adapters have their tool-call time limits lifted.
- Ctrl+C at a question stops the run (exit 130).
- If the agent stops waiting (a crash, a limit hit), the question is taken down and `-- question withdrawn: the agent stopped waiting` is printed. A batch that was still queued behind another one prints `-- question withdrawn before it was shown: the agent stopped waiting`.
- Without a terminal (input piped in), nothing is asked: each question fails with *"No one can answer questions in this run."* The agent gets a failed tool call, counted in `-- N tool calls failed`, and carries on.
- Claude's own question tool, `AskUserQuestion`, is switched off so the agent always uses `ask_user`; OpenCode's `question` tool already is.
- The log records each batch when it arrives (`"kind":"question"`), even one queued behind another, then your answers (`"kind":"answer"`) or its withdrawal (`"kind":"withdrawn"`). All three carry the batch's number within the run (`"batch":1`, `2`, …).

The tool is a small program, `packages/ask-user`, that passes questions to `run-agent` over a private connection per run. FlowBoard's worker will later answer the same tool from the web inbox and Slack.

## Permission modes

A headless run has no one to approve anything, so "asks" means "is refused" unless `allow` already covers the tool.

| Mode | Claude Code | OpenCode |
|---|---|---|
| `default` | Tools that need approval are refused; read-only tools run | Read-only tools run; everything else not in `allow` is refused |
| `acceptEdits` (default) | File edits run; other tools that need approval are refused | File edits run; everything else not in `allow` is refused |
| `dontAsk` | Only tools in `allow` run | Same as `default` |
| `plan` | Claude plans and does not edit or run commands | Same as `default` (OpenCode has no plan mode here) |
| `bypassPermissions` | Everything runs except `deny`. Needs the shell opt-in | Everything runs except `deny`. Needs the shell opt-in |
| `auto` | Claude's own classifier approves or refuses each call. Needs the shell opt-in | Every request is approved. Needs the shell opt-in |

On OpenCode the read-only tools are `read`, `glob`, `grep`, `list`, `todowrite`, `skill` and `lsp`. Reading a `*.env` or `*.env.*` file (not `*.env.example`) asks first, as OpenCode does by default, so a headless run refuses it unless an explicit allow such as `Read(.env)` covers the file; `bypassPermissions` and `auto` approve the ask. Claude reads `.env` files like any other file. OpenCode's own `question` tool is always refused, because it would wait forever for an answer.

## Unrestricted shell

The guards limit the agent's file-editing tools and recursive `rm` to `folder`, but any other shell command, such as `echo x > ~/file`, can write anywhere you can. So a setting that lets the agent run any shell command is refused unless `permissions.allow_unrestricted_shell: true` is set. The settings are:

- `permissions.mode` set to `bypassPermissions` or `auto`;
- an `allow` entry of `Bash` with no pattern, or with a pattern of only `*`, `:` and spaces: `Bash(*)`, `Bash(:*)`, `Bash(**)`, `Bash(*:*)`, in any letter case;
- with `adapter: opencode`, also an `allow` entry that OpenCode's own matcher reads as any shell command. OpenCode matches the tool name as a glob, so a name that matches `bash` (`*`, `b*`, `ba?h`, `B*`) counts when it has no pattern, or a pattern made only of `*`, `?` and spaces with at least one `*` (`Bash(?*)`, `Bash(??*)`, `*(*)`). `Bash(git *)`, `Bash(?)`, `w*` and `Read` need no opt-in.

Claude Code matches allow rules by exact tool name (checked in 2.1.302: it globs tool names only in deny and ask rules), so on Claude `allow: ["*"]` or `["b*"]` allows nothing and needs no opt-in.

Without the opt-in the error reads, for example:

```
task.yaml: permissions.mode: bypassPermissions lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it
```

An `allow` entry gets the same message, starting `task.yaml: permissions.allow: "*"`. With the opt-in, the run goes ahead and its header prints `-- warning: unrestricted shell: commands can write outside <folder>`. A narrower pattern such as `Bash(pnpm *)` needs no opt-in; it is trusted as written, even though the command it allows could itself write elsewhere.

## Guards

Guards are checked inside the agent on every tool call it makes, on both adapters, whatever the permission mode. Every run has them, even when the YAML has no `guards` key.

- **File edits stay in `folder`.** A file edit (Claude: `Write`, `Edit`, `MultiEdit`, `NotebookEdit`; OpenCode: `write`, `edit`, `apply_patch`) is checked where it lands, with links followed, a dangling one too, and a leading `~/` read as your home folder. One outside `folder` is refused with *Write outside the worktree: \<path\>*. One through a link inside `folder` that points outside is refused with *Write through a link to outside the worktree: \<path\> -> \<where it lands\>*.
- **`deny_paths`** refuses file edits to matching paths inside `folder` with *Path is a non-goal: \<glob\>*. The globs are Node's `path.matchesGlob`, matched against the path relative to `folder`:
  - `*` stays within one folder and `**` crosses folders, so `*.lock` covers only the lock files at the top of `folder`, and `**/*.lock` covers them all;
  - names that start with a dot match too: `secret/**` covers `secret/.env`, and a glob that names a dot-file or dot-folder matches it among other dot names (`**/.env` covers `.config/.env`, `.github/**` covers `.github/.hidden`);
  - letter case is ignored on macOS and Windows, as the disk ignores it (the path and the glob are lower-cased before matching, so `docs/**` covers `DOCS/a.md`), and counts on Linux;
  - only file edits are checked: a shell command that an allow rule permits can still write there.
- **Recursive `rm` stays inside `folder`.** A recursive `rm` (`-r`, `-R`, any flag group holding `r` or `R` such as `-rf`, or `--recursive`, before or after the paths) is refused with *Recursive rm outside the worktree: \<path\>* when a path it names lands outside `folder`, or is `folder` itself.
  - Paths are taken from where the shell is: its current folder on Claude, where a `cd` carries over between commands; bash's `workdir` on OpenCode; and any `cd` or `pushd` earlier in the same command, also after a shell keyword (`if cd /tmp; then rm -rf foo; fi` is refused).
  - An absolute path inside `folder` is fine, and so is `.`, which `rm` refuses to remove anyway. A link named without a trailing slash is removed itself, so it is fine inside `folder`; with the slash (`link/`), it is checked where it points.
  - A path the shell would expand first is refused with *Recursive rm of a path the shell expands: \<path\>*: one holding `$`, a backtick or `\`, one starting with `~`, a dot-name with a wildcard such as `.*`, or a brace other than a simple list. A simple list such as `{dist,build}` is expanded and each part checked.
  - After a `cd` the guard cannot follow (`cd "$X"`, `cd ~`, a `cd` with an option such as `cd -` or `cd -P x`, a bare `cd`), a relative path is refused with *Recursive rm after a cd the guard cannot follow: \<path\>*.
  - `rm` fed by `xargs` is refused with *Recursive rm through xargs: its paths come from stdin; use find … -exec rm -rf {} +*. `find … -exec rm -rf {} +`, or `{} \;`, is checked against the folders `find` starts from.
  - The check also finds `rm` inside `bash -c "…"` and backticks, after `sudo`, and written as `/bin/rm` or `\rm`. A plain `rm` without `-r`, and `git rm`, are not checked.
- **Commands** are matched against the built-in list plus `deny_commands`, and a match is refused with *Command blocked by policy: \<regex\>*. The built-in list blocks `git push` and `git reset --hard`, also with options in between (`git -C . push`, `git --no-pager push`, `git reset -q --hard`), and piping `curl` or `wget` into a shell.

Both command checks read the command's text, so they can be got around: a script, `eval`, `find -delete`, or another command that deletes (`git clean`, `mv`, `truncate`). They are a safety net, not a sandbox. And there is no sandbox: every run is a process on your machine, running as you in the real `folder`, and its shell commands see your files and most of your environment. The shell opt-in, the permission mode and the guards are what limit a run.

## Same YAML, different adapter

Switching a file between adapters means changing `adapter` and `model`; every other field works on both. Some behave differently:

| Field | Claude Code | OpenCode |
|---|---|---|
| `model` | Alias or id | `providerID/modelID` |
| `effort` | Always applied | Dropped silently when the model has no variant of that name |
| `system_prompt` | Added after Claude Code's built-in system prompt | Sent as the request's system prompt |
| `plugins`, `skills` | The folder is mounted as a Claude Code plugin | Only the folder's `skills/` is read |
| `skill` | Invoked as the slash command | Becomes *Use the "<skill>" skill.* in the prompt |
| `Bash(...)` patterns | Claude Code style, e.g. `Bash(pnpm:*)` | Glob style, e.g. `Bash(pnpm *)`. Patterns pass through unchanged, so one style may not match on the other adapter |
| Tool names in `allow` / `deny` | As written. An `allow` entry names one tool exactly, so `*` or `b*` allows nothing | Mapped: `Write`/`Edit` → `edit`, `Bash` → `bash`, `LS` → `list`, others lowercased. Names are globs, so `*` or `b*` also allows `bash`, and needs the shell opt-in |
| Reading `.env` files | Like any other file | `*.env` and `*.env.*` (not `*.env.example`) ask first, so a headless run refuses them unless an explicit allow such as `Read(.env)` covers the file, or the mode is `bypassPermissions` or `auto` |
| `budget_usd` | Uses Claude's reported cost | Uses OpenCode's price table; a model with no listed price costs 0, so the cap never triggers |
| `max_turns` | Claude turns; running out fails the run | OpenCode steps. Every agent (`build`, `plan`, `general`, `explore`) gets the limit, so subagents are limited too. Running out fails the run too, when the main agent still wanted tools on the step before its last |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The run finished without an error. This does not prove the task was done: check the `-- N tool calls failed` and `-- last message:` lines printed before the result |
| 1 | The run failed (provider error, budget or turn limit hit, crash), or could not be set up (`cannot set up the run: …`) |
| 2 | Bad YAML or bad command line; nothing launched |
| 130 | Stopped with Ctrl+C, by closing the terminal, or by a kill (SIGTERM) |

## Related

- [[Testing The Run Agent CLI]]
- [[Run Agent CLI Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
