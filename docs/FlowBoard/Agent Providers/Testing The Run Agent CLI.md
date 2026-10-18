---
tags: [flowboard, agent-providers, testing, cli, how-to]
module: Agent Providers
date: 2026-10-18
---

# Testing The Run Agent CLI

How to check the two providers ([[Claude Code Adapter]], [[OpenCode Adapter]]) and the `run-agent` command that drives them from a YAML file. Three levels, cheapest first: the automated suite (free), the live tests (a little quota and credit), and hand-run scenarios with your own YAML files. Every YAML field is described in [[Run Config Reference]]; the calls behind the command are in [[Run Agent CLI Decisions]].

## Before you start

- **Claude:** the `claude` CLI is installed and logged in with your subscription (`claude` opens without asking you to log in). No API key is used; runs spend subscription quota.
- **OpenCode:** the `opencode` CLI is installed (1.19.3) with an OpenRouter key (`opencode auth login`). Runs cost real OpenRouter credit.
- **Code:** everything lives in `code/flowboard/` on branch `feature/agent-providers`. Today that is the worktree `.claude/worktrees/agent-providers/code/flowboard`; after a merge it is `code/flowboard` in the main checkout. Run `pnpm install` there once.

## 1. Automated suite (free)

From `code/flowboard/`:

```sh
pnpm typecheck:packages
pnpm test:packages
```

Expect no type errors and `fail 0`, with 12 tests skipped (the live ones). This covers YAML validation, the YAML-to-run mapping, asking and answering questions, logging, exit codes and Ctrl+C handling, using a replay provider that spends nothing.

## 2. Live tests (costs a little)

```sh
pnpm test:live
```

Ten tests against the real CLIs: three for Claude (hello, a plugin skill, the write guard), three for OpenCode (the same three), two that run a YAML file through `run-agent` on each adapter, and two where the agent asks a question through `ask_user` and uses the answer. Expect `pass 10`, with two more skipped: the six-minute waits, which also need `FLOWBOARD_LIVE_SLOW=1` and take about twelve minutes (the model is idle while it waits, so they cost no more than the quick ones). To try another OpenCode model, set `FLOWBOARD_OPENCODE_MODEL=providerID/modelID`.

## 3. Hand-run scenarios

### Set up a scratch folder

Paths in the YAML are relative to the folder you run the command from, and the log goes into `runs/` there. So make a scratch folder and run from it:

```sh
mkdir -p ~/fb-try/proj && cd ~/fb-try
alias fbrun='pnpm -s --dir /Users/alex/projects/personal/flowboard/flowboard_v3/.claude/worktrees/agent-providers/code/flowboard run-agent'
```

`-s` hides pnpm's own *Command failed* banner. Check the exit code after each run with `echo "exit $?"`.

The base YAML, `task.yaml`:

```yaml
adapter: claude-code
model: haiku
folder: proj
prompt: task.md
limits:
  max_turns: 4
  budget_usd: 0.20
```

and `task.md`:

```markdown
List the files in this folder, then create notes.md containing the word hello.
```

Every run prints a header (`-- claude-code haiku in …`, `-- log …`), one line per event, then a short summary and `-- result {…}`. The summary is `-- N tool calls failed` (only when some did) and `-- last message: …`, the agent's final words. Exit 0 only means the run finished without an error; read the summary to see whether the task got done.

### Scenarios

Each row changes the base files as shown. "Exit" is what `echo "exit $?"` prints.

| # | What it checks | Change | Expect |
|---|---|---|---|
| 1 | A plain run | none | `assistant_text` and `tool_use` lines; `proj/notes.md` exists; exit 0 |
| 2 | OpenCode | `adapter: opencode`, `model: openrouter/deepseek/deepseek-v4.1-flash` | Same as 1, on DeepSeek; exit 0 |
| 3 | Write guard | `task.md`: *Create the file /tmp/fb-outside.txt.* | If the agent tries, a `tool_result` with `ok:false` and *Write outside the worktree*; no `/tmp/fb-outside.txt` |
| 4 | Non-goal paths | add `guards: { deny_paths: ["secret/**"] }`; `task.md`: *Create secret/key.txt.* | *Path is a non-goal: secret/\*\** in a tool result; no `proj/secret/key.txt` |
| 5 | Command guard | add `permissions: { allow: ["Bash(git *)"] }`; `task.md`: *Run git push.* | *Command blocked by policy* in a tool result |
| 6 | Shell refusal | `permissions: { mode: bypassPermissions }` | Nothing launches: `task.yaml: permissions.mode: bypassPermissions lets shell commands write outside folder; …`; exit 2. Same for `allow: [Bash]` or `allow: ["Bash(:*)"]` |
| 7 | Shell opt-in | add `allow_unrestricted_shell: true` under `permissions` to 6 | The run goes ahead; the header has `-- warning: unrestricted shell: …`; exit 0 |
| 8 | Validation | add `colour: red`, or change `folder: nope` | `task.yaml: colour: unknown key` or `task.yaml: folder: not a directory: …`; exit 2; no `runs/` file |
| 9 | Plugin skill | `plugins: [<…>/code/flowboard/packages/adapters/test/fixtures/fbecho-plugin]`, `skill: /fbecho:echo`, `task.md` empty | The agent replies `ECHO-OK`; exit 0 |
| 10 | Budget cap | `limits: { budget_usd: 0.0001 }` | The run stops early; the result has an `error` about the budget; exit 1 |
| 11 | Effort | `effort: low` (Claude), or on OpenCode a model that has that variant | Runs as normal. OpenCode drops an effort the model has no variant for, without saying so |
| 12 | Ctrl+C | `task.md`: *Count slowly from 1 to 50, one line per number.*; press Ctrl+C once mid-run | `-- stopping`, then `-- result` with `"error":"stopped"`; exit 130; the log ends with a `result` line. Pressing Ctrl+C again (after 300 ms) exits at once, without the result line |
| 13 | Answering a question | `grill-me.yaml` below, from a real terminal | The event lines pause and grill-me's questions appear one at a time; answer a few; the log has `question` and `answer` lines; Ctrl+C at a question exits 130 |

Scenario 12 has only been tested with simulated signals; it is the one worth doing by hand first (see [[Run Agent CLI Decisions]], deferred issues).

### Example YAML files

Complete files, ready to save in `~/fb-try` and run with `fbrun <file>.yaml`. Each needs `proj/` and the prompt file it names. Unknown keys are errors, so a typo in any of them stops the run before launch.

**Every field** (reference; Claude):

```yaml
# all-fields.yaml
adapter: claude-code            # claude-code | opencode
model: sonnet                   # Claude alias or id; opencode needs providerID/modelID
effort: medium                  # low | medium | high | xhigh | max
folder: proj                    # where the agent works; must exist
prompt: task.md                 # the task, as markdown; must exist
system_prompt: You are a careful engineer. Keep changes small.
permissions:
  mode: acceptEdits             # default | acceptEdits | bypassPermissions | dontAsk | plan | auto
  allow: [Read, Write, Edit, "Bash(ls *)", "Bash(cat *)"]
  deny: [WebFetch, WebSearch]
guards:
  deny_paths: ["secret/**", "*.lock"]       # globs relative to folder
  deny_commands: ['\bnpm\s+publish\b']      # regexes, added to the built-in ones
limits:
  budget_usd: 0.50
  max_turns: 10
```

**OpenCode on DeepSeek** (scenario 2):

```yaml
# opencode.yaml
adapter: opencode
model: openrouter/deepseek/deepseek-v4.1-flash
folder: proj
prompt: task.md
limits:
  max_turns: 4
  budget_usd: 0.05
```

**Guards** (scenarios 3–5; pair with a `guards.md` that asks for something blocked, e.g. *Create secret/key.txt, then run git push.*):

```yaml
# guards.yaml
adapter: claude-code
model: haiku
folder: proj
prompt: guards.md
permissions:
  allow: ["Bash(git *)"]
guards:
  deny_paths: ["secret/**"]
limits:
  max_turns: 6
  budget_usd: 0.20
```

**Refused, then allowed: unrestricted shell** (scenarios 6–7). As written it exits 2; uncomment the last permissions line to opt in:

```yaml
# shell.yaml
adapter: claude-code
model: haiku
folder: proj
prompt: task.md
permissions:
  mode: bypassPermissions
  # allow_unrestricted_shell: true
limits:
  max_turns: 4
  budget_usd: 0.20
```

**Plugin skill** (scenario 9; `empty.md` is an empty file, allowed because `skill` is set):

```yaml
# skill.yaml
adapter: claude-code
model: haiku
folder: proj
prompt: empty.md
plugins:
  - /Users/alex/projects/personal/flowboard/flowboard_v3/.claude/worktrees/agent-providers/code/flowboard/packages/adapters/test/fixtures/fbecho-plugin
skill: /fbecho:echo
limits:
  max_turns: 2
  budget_usd: 0.10
```

**Budget cap** (scenario 10; expect exit 1):

```yaml
# budget.yaml
adapter: claude-code
model: haiku
folder: proj
prompt: task.md
limits:
  budget_usd: 0.0001
```

**Ctrl+C** (scenario 12; pair with a `slow.md` such as *Count slowly from 1 to 50, one line per number.*):

```yaml
# slow.yaml
adapter: claude-code
model: haiku
folder: proj
prompt: slow.md
limits:
  max_turns: 3
  budget_usd: 0.10
```

**Your grill-me skill** (scenario 13; `topic.md` holds what you want to be grilled on, e.g. *I want to add dark mode to FlowBoard.*):

```yaml
# grill-me.yaml
adapter: claude-code
model: sonnet
folder: proj
prompt: topic.md
skills:
  - ~/.agents/repos/mattpocock-skills/skills/productivity/grill-me
skill: /grill-me
limits:
  max_turns: 30
  budget_usd: 1.00
```

**Broken on purpose** (scenario 8; expect four error lines and exit 2):

```yaml
# broken.yaml
adapter: claude-code
model: haiku
folder: nope                    # folder: not a directory
prompt: missing.md              # prompt: not a file
skill: echo                     # skill: must start with "/"
guards:
  deny_commands: ['(']          # guards.deny_commands.0: invalid regex
```

## Reading the logs

Each run writes `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`: a `start` line (the YAML path and the resolved run settings), one `event` line per event with the provider's native message in `raw`, and a final `result` line. With `jq`:

```sh
log=$(ls -t runs/*.jsonl | head -1)
jq -c 'select(.kind=="result") | .result' "$log"                 # outcome, usage, cost
jq -r 'select(.kind=="event") | .event.type' "$log" | sort | uniq -c   # event counts
jq -r 'select(.kind=="event" and .event.type=="assistant_text") | .event.text' "$log"
jq 'select(.kind=="start") | .config' "$log"                     # what was actually launched
```

A run that crashed or was killed still has every line up to that point.

## Related

- [[Run Agent CLI Decisions]]
- [[Provider Implementation Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
