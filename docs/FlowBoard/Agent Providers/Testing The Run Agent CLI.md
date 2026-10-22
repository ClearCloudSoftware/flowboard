---
tags: [flowboard, agent-providers, testing, cli, how-to]
module: Agent Providers
date: 2026-10-18
---

# Testing The Run Agent CLI

How to check the two providers ([[Claude Code Adapter]], [[OpenCode Adapter]]) and the `run-agent` command that drives them from a YAML file. Three levels, cheapest first: the automated suite (free), the live tests (a little quota and credit), and hand-run scenarios with your own YAML files. Every YAML field is described in [[Run Config Reference]]; the calls behind the command are in [[Run Agent CLI Decisions]].

> [!check] Changed 2026-10-22
> The free suite can no longer run the paid tests and cleans up its temp folders, question log lines carry a `batch` number (R38 and R36 in [[Run Agent CLI Decisions]]), and the guards changed (see [[Run Config Reference]]). Claude decided these on 2026-10-22; they are open to Alex's review.

## Before you start

- **Claude:** the `claude` CLI is installed and logged in with your subscription (`claude` opens without asking you to log in). No API key is used; runs spend subscription quota.
- **OpenCode:** the `opencode` CLI is installed (1.19.3) with an OpenRouter key (`opencode auth login`). Runs cost real OpenRouter credit.
- **Code:** `code/flowboard/` in the main checkout, on `dev` (merged from `feature/agent-providers` on 2026-10-19). Run `pnpm install` there first: without it the suite fails with `ERR_MODULE_NOT_FOUND`.
- **Node:** the suite and `run-agent` run the TypeScript files directly, through Node's built-in type stripping. Checked with Node 24.11.1. Nothing in the repo pins a version (no `.nvmrc`, no `engines` field); `@types/node` is `^24`.

## 1. Automated suite (free)

From `code/flowboard/`:

```sh
pnpm typecheck:packages
pnpm test:packages
```

Expect no type errors and 226 tests: 212 pass, 14 skipped (the live ones), `fail 0`. This covers YAML validation, the YAML-to-run mapping, the guards, asking and answering questions, logging, exit codes and Ctrl+C handling, using fake CLIs, a fake OpenCode server and a replay provider, which spend nothing.

The free suite cannot spend money: `pnpm test:packages` blanks `FLOWBOARD_LIVE`, so the live files show as skipped even when you have exported it. Every test file removes the temp folders it creates.

## 2. Live tests (costs a little)

```sh
pnpm test:live
```

Fourteen tests against the real CLIs, in four files:

| File | Tests | With a plain `pnpm test:live` |
|---|---|---|
| `adapters/test/claude-live.test.ts` | Claude: hello, a plugin skill, the write guard | All 3 run |
| `adapters/test/opencode-live.test.ts` | OpenCode: the same three | All 3 skipped: they also need `FLOWBOARD_OPENCODE_MODEL=providerID/modelID` |
| `cli/test/cli-live.test.ts` | A YAML file through `run-agent`, once per adapter | Both run |
| `cli/test/ask-live.test.ts` | Per adapter: the agent asks through `ask_user` and uses the answer; a standalone `skills:` folder is mounted and its skill invoked; a question waits six minutes | 4 of 6 run: the two six-minute waits also need `FLOWBOARD_LIVE_SLOW=1` |

So a plain `pnpm test:live` runs 9 tests and skips 5, and still spends OpenRouter credit: the OpenCode runs in `cli-live` and `ask-live` use `openrouter/deepseek/deepseek-v4.1-flash` unless `FLOWBOARD_OPENCODE_MODEL` names another model. The Claude runs use `haiku` and spend subscription quota.

To run all twelve quick tests:

```sh
FLOWBOARD_OPENCODE_MODEL=openrouter/deepseek/deepseek-v4.1-flash pnpm test:live
```

Expect `pass 12`, with the two six-minute waits skipped. Add `FLOWBOARD_LIVE_SLOW=1` to run them too: they take about twelve more minutes, and cost no more than the quick ones, because the model is idle while it waits.

## 3. Hand-run scenarios

### Set up a scratch folder

Paths in the YAML are relative to the folder you run the command from, and the log goes into `runs/` there. So make a scratch folder and run from it:

```sh
mkdir -p ~/fb-try/proj && cd ~/fb-try
alias fbrun='pnpm -s --dir /Users/alex/projects/personal/flowboard/flowboard_v3/code/flowboard run-agent'
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
| 4 | Non-goal paths | add `guards: { deny_paths: ["secret/**"] }`; `task.md`: *Create secret/key.txt.* | If the agent tries, *Path is a non-goal: secret/\*\** in a tool result; no `proj/secret/key.txt`. Dot-files are covered too: *Create secret/.env.* is refused the same way |
| 5 | Command guard | add `permissions: { allow: ["Bash(git *)"] }`; `task.md`: *Run git push.* | *Command blocked by policy* in a tool result |
| 6 | Shell refusal | `permissions: { mode: bypassPermissions }` | Nothing launches: `task.yaml: permissions.mode: bypassPermissions lets shell commands write outside folder; …`; exit 2. Same for `allow: [Bash]` or `allow: ["Bash(:*)"]`, and on `adapter: opencode` for `allow: ["*"]` or `allow: ["Bash(?*)"]` |
| 7 | Shell opt-in | add `allow_unrestricted_shell: true` under `permissions` to 6 | The run goes ahead; the header has `-- warning: unrestricted shell: …`; exit 0 |
| 8 | Validation | add `colour: red`, or change `folder: nope` | `task.yaml: colour: unknown key` or `task.yaml: folder: not a directory: …`; exit 2; no `runs/` file |
| 9 | Plugin skill | `plugins: [<…>/code/flowboard/packages/adapters/test/fixtures/fbecho-plugin]`, `skill: /fbecho:echo`, `task.md` empty. The plugin is named `fbecho` in its `.claude-plugin/plugin.json`, not after its folder | The agent replies `ECHO-OK`; exit 0 |
| 10 | Budget cap | `limits: { budget_usd: 0.0001 }` | The run stops early; the result has an `error` about the budget; exit 1 |
| 11 | Effort | `effort: low` (Claude), or on OpenCode a model that has that variant | Runs as normal. OpenCode drops an effort the model has no variant for, without saying so |
| 12 | Ctrl+C | `task.md`: *Count slowly from 1 to 50, one line per number.*; press Ctrl+C once mid-run | `-- stopping`, then `-- result` with `"error":"stopped"`; exit 130; the log ends with a `result` line. Pressing Ctrl+C again (after 300 ms) exits at once, without the result line |
| 13 | Answering a question | `grill-me.yaml` below, from a real terminal | The event lines pause and grill-me's questions appear one at a time; answer a few; the log has `question` and `answer` lines with matching `batch` numbers; Ctrl+C at a question exits 130 |

Scenario 12 has only been tested with simulated signals; it is the one worth doing by hand first (see [[Run Agent CLI Decisions]], deferred issues).

### Example YAML files

Complete files, ready to save in `~/fb-try` and run with `fbrun <file>.yaml`. Each needs `proj/` and the prompt file it names. Unknown keys are errors, so a typo in any of them stops the run before launch.

**Nearly every field** (reference; Claude). It leaves out `plugins`, `skills` and `skill`, which need real plugin or skill folders: see `skill.yaml` and `grill-me.yaml` below.

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
  allow_unrestricted_shell: false           # true lets bypassPermissions, auto or an any-command Bash rule load
guards:
  deny_paths: ["secret/**", "**/*.lock"]    # globs relative to folder; * stays in one folder, ** crosses folders
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
  - /Users/alex/projects/personal/flowboard/flowboard_v3/code/flowboard/packages/adapters/test/fixtures/fbecho-plugin
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

## Testing with free models

Free OpenRouter models work through the OpenCode adapter and cost nothing, which makes them handy for hand-run scenarios. They behave differently from paid ones, though. Findings from a grill-me run on 2026-10-18 with `openrouter/dots-studio/dots-3-note-preview:free` (task: *write a TypeScript class for an animal and a dog*):

| What happened | Why | What to do |
|---|---|---|
| The run worked: the agent loaded grill-me, asked three questions (purpose, features, abstract or concrete), then wrote `animal.ts` and exited 0 | | |
| Its first `ask_user` call was rejected with `MCP error -32602: … expected object, received string at question`; it fixed the call on the next step | The model sent the question as plain text, with `id`, `kind` and the options as JSON text spread beside it | Nothing: since R32 ([[Run Agent CLI Decisions]]) the question tool accepts that shape. On an older build, expect one wasted step per run |
| A run with `max_turns: 4` stopped after one question with `max_turns: reached the limit of 4 steps` and exit 1 | Loading the skill takes a step, each question takes a step, and writing the answer takes more | Give grill-me runs at least 20 turns; 30 is comfortable |
| `budget_usd` never stopped anything | A free model reports a cost of $0, so the budget cap never triggers (decision O12 in [[Provider Implementation Decisions]]) | Rely on `max_turns` to bound a free-model run |
| The agent's attempt to check its work (`npx tsc --strict --noEmit animal.ts`) was refused | The YAML allowed only `Bash(ls *)` and `Bash(cat *)` | Add the command to `allow`, e.g. `"Bash(npx tsc *)"`, if you want the agent to verify |
| Only three questions before writing code | Small free models interview far less thoroughly than grill-me asks; this is the model, not the runner | Use a stronger model to judge the skill itself; use a free one to check that asking works |
| The agent saw `agent.yaml`, `task.md` and the `runs/` logs | `folder` was the test folder itself | Point `folder` at a subfolder such as `proj` |

The YAML that worked, for reuse:

```yaml
# free-grill-me.yaml
adapter: opencode
model: openrouter/dots-studio/dots-3-note-preview:free
folder: proj
prompt: task.md
skills:
  - ~/.agents/repos/mattpocock-skills/skills/productivity/grill-me
skill: /grill-me
permissions:
  allow: [Read, Write, Edit, "Bash(ls *)", "Bash(cat *)"]
  deny: [WebFetch, WebSearch]
limits:
  max_turns: 30
```

## Reading the logs

Each run writes `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl`, one JSON object per line. Every line has a `kind` and an `at` timestamp:

| `kind` | What else it holds |
|---|---|
| `start` | `yaml`, the YAML's path, and `config`, the run settings as launched (with the ask tool and any `local` skills plugin added) |
| `event` | `event`: one normalized event, with the provider's native message in `raw` (absent on errors the adapter raises itself) |
| `question` | `batch` and `questions`, written when the batch arrives, even if it waits behind another |
| `answer` | `batch` and `answers` |
| `withdrawn` | `batch`: the agent stopped waiting for that batch |
| `result` | `result`, the run's result: usage, exit code, error |

With `jq`:

```sh
log=$(ls -t runs/*.jsonl | head -1)
jq -c 'select(.kind=="result") | .result' "$log"                 # exit code, error, usage, cost
jq -r 'select(.kind=="event") | .event.type' "$log" | sort | uniq -c   # event counts
jq -r 'select(.kind=="event" and .event.type=="assistant_text") | .event.text' "$log"
jq 'select(.kind=="start") | .config' "$log"                     # what was actually launched
jq -c 'select(.kind=="question" or .kind=="answer" or .kind=="withdrawn") | [.kind, .batch]' "$log"   # questions by batch
```

A run whose setup fails (the temp folder, the question socket or the skills copy) has only a `result` line; a bad YAML writes no log at all. A run that crashed or was killed still has every line up to that point.

## Related

- [[Run Agent CLI Decisions]]
- [[Provider Implementation Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Agent Providers Index]]
