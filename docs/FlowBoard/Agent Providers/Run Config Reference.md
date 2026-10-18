---
tags: [flowboard, agent-providers, reference, cli]
module: Agent Providers
date: 2026-10-18
---

# Run Config Reference

Every field of the YAML file that `pnpm run-agent <task.yaml>` reads: what it means, its type and default, how it is checked, and how it behaves on each adapter. One file describes one run. How to try it out is in [[Testing The Run Agent CLI]]; why the rules are what they are is in [[Run Agent CLI Decisions]].

Code: `code/flowboard/packages/cli/src/config.ts`.

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
- **Relative paths** (`folder`, `prompt`, `plugins`, and the YAML path given on the command line) resolve against the folder you ran the command from, not the YAML file's folder. Absolute paths are used as written. A leading `~/` means your home folder; write a bare home folder as `"~"` in quotes, because unquoted `~` is YAML's empty value.
- **The log** goes into `runs/` in the folder you ran the command from, named `<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`.
- **Errors** are printed one per line as `<yaml path>: <field>: <message>`, and the command exits with code 2 before anything launches. Type and unknown-key errors are reported first; the file, folder and rule checks run once those are fixed.
- **Secrets** never go in the YAML. Claude uses your `claude` login; OpenCode uses its own stored credentials.

## Fields

| Field | Type | Required | Default | Checked | Meaning |
|---|---|---|---|---|---|
| `adapter` | `claude-code` \| `opencode` | yes | | one of the two | Which provider runs the task |
| `model` | string | yes | | `opencode`: must contain `/` | The model. Claude: an alias (`haiku`, `sonnet`, `opus`) or a full model id. OpenCode: `providerID/modelID`, e.g. `openrouter/deepseek/deepseek-v4.1-flash` |
| `effort` | `low` \| `medium` \| `high` \| `xhigh` \| `max` | no | the model's own | one of the five | How hard the model thinks |
| `folder` | path | yes | | an existing directory | Where the agent works. All writes are limited to it (see *Guards*) |
| `prompt` | path | yes | | an existing file; not blank unless `skill` is set | Markdown file holding the task. Its text is the task; the runner adds a fixed closing line: *"You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop."* |
| `system_prompt` | string | no | none | | Extra instructions for the agent's system prompt |
| `plugins` | list of paths | no | none | each an existing directory | Plugin folders whose skills the agent can use. A plugin's name is its folder name |
| `skills` | list of paths | no | none | each an existing directory with a `SKILL.md` whose `name:` equals the folder name; no two with the same name | Standalone skill folders. Each run copies them into a temporary plugin named `local` |
| `skill` | string | no | none | starts with `/`; a plain `/<name>` must be one of `skills` | A skill to invoke: `/<plugin>:<skill>` for a plugin skill, or `/<name>` for one from `skills`. With a skill set, the prompt file may be empty |
| `permissions.mode` | see *Permission modes* | no | `acceptEdits` | one of the six; see *Unrestricted shell* | How tool calls that need approval are handled, with no one there to approve |
| `permissions.allow` | list of tool rules | no | none | see *Unrestricted shell* | Tools the agent may use without asking. `Read`, `Write`, `Edit`, `Bash`, `Bash(<pattern>)`, `WebFetch`, `mcp__<server>__<tool>`, … |
| `permissions.deny` | list of tool rules | no | none | | Tools the agent may never use; wins over `allow` |
| `permissions.allow_unrestricted_shell` | boolean | no | `false` | | Opt-in that lets a setting giving the agent any shell command go ahead |
| `guards.deny_paths` | list of globs | no | none | | Paths inside `folder` the agent may not write, relative to `folder` (`docs/**`, `*.lock`) |
| `guards.deny_commands` | list of regexes | no | none | each compiles as a regex | Shell commands to block, added to the built-in list |
| `limits.budget_usd` | number | no | no cap | greater than 0 | Stop the run once it has cost this many US dollars |
| `limits.max_turns` | whole number | no | the provider's own | greater than 0 | Stop after this many agent turns |

## Asking the owner

Every run gives the agent two tools, `ask_user` (one question) and `ask_user_batch` (several), and the closing line tells it to use them. When it asks, the event lines pause and the question appears in the terminal:

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
- If the agent stops waiting (a crash, a limit hit), the question is taken down and `-- question withdrawn: the agent stopped waiting` is printed.
- Without a terminal (input piped in), every question is answered with *"No one can answer questions in this run."* and the agent carries on.
- Claude's own question tool, `AskUserQuestion`, is switched off so the agent always uses `ask_user`; OpenCode's `question` tool already is.
- The log records each batch (`"kind":"question"`), your answers (`"kind":"answer"`) and any withdrawal (`"kind":"withdrawn"`).

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

On OpenCode the read-only tools are `read`, `glob`, `grep`, `list`, `todowrite`, `skill` and `lsp`. OpenCode's own `question` tool is always refused, because it would wait forever for an answer.

## Unrestricted shell

The guards limit the agent's file-editing tools to `folder`, but a shell command such as `echo x > ~/file` can write anywhere you can. So a setting that lets the agent run any shell command is refused unless `permissions.allow_unrestricted_shell: true` is set. The settings are:

- `permissions.mode` set to `bypassPermissions` or `auto`;
- an `allow` entry of `Bash` with no pattern, or with a pattern of only `*`, `:` and spaces: `Bash(*)`, `Bash(:*)`, `Bash(**)`, `Bash(*:*)`, in any letter case.

Without the opt-in the error reads, for example:

```
task.yaml: permissions.mode: bypassPermissions lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it
```

With it, the run goes ahead and its header prints `-- warning: unrestricted shell: commands can write outside <folder>`. A narrower pattern such as `Bash(pnpm *)` needs no opt-in; it is trusted as written, even though the command it allows could itself write elsewhere.

## Guards

Guards are checked inside the agent on every tool call, on both adapters, whatever the permission mode. Every run has them, even when the YAML has no `guards` key:

- **Writes stay in `folder`.** A file edit (Claude: `Write`, `Edit`, `MultiEdit`, `NotebookEdit`; OpenCode: `write`, `edit`, `apply_patch`) outside it is refused with *Write outside the worktree*.
- **`deny_paths`** refuses edits to matching paths inside `folder` with *Path is a non-goal: <glob>*.
- **Commands** are matched against the built-in list plus `deny_commands`, and a match is refused with *Command blocked by policy*. The built-in list blocks `git push`, `git reset --hard`, piping `curl` or `wget` into a shell, and recursive `rm` of `/`, `~` or `..`.

Command matching is by regex, so it can be got around (a script, `eval`); it is a safety net, not a sandbox.

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
| Tool names in `allow` / `deny` | As written | Mapped: `Write`/`Edit` → `edit`, `Bash` → `bash`, `LS` → `list`, others lowercased |
| `budget_usd` | Uses Claude's reported cost | Uses OpenCode's price table; a model with no listed price costs 0, so the cap never triggers |
| `max_turns` | Claude turns; running out fails the run | OpenCode steps of the main agent; subagents are not limited. Running out fails the run too, when the agent still wanted tools on the step before its last |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The run finished without an error. This does not prove the task was done: check the `-- N tool calls failed` and `-- last message:` lines printed before the result |
| 1 | The run failed (provider error, budget or turn limit hit, crash) |
| 2 | Bad YAML or bad command line; nothing launched |
| 130 | Stopped with Ctrl+C |

## Related

- [[Testing The Run Agent CLI]]
- [[Run Agent CLI Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
