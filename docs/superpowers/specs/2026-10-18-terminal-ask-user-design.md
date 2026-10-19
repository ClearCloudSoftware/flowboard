# Terminal ask_user for run-agent — design

Date: 2026-10-18. Branch: `feature/agent-providers`. Builds on the `run-agent` CLI (`docs/superpowers/specs/2026-10-18-yaml-run-config-design.md`, code in `code/flowboard/packages/cli/`) and the two providers in `packages/adapters/`. The Human In The Loop design it follows is in `docs/FlowBoard/Human In The Loop/` (`Ask User MCP Server.md`, `Questions.md`, `Ask Park And Resume.md`).

## Intent

The owner wants to run skills that need their input, such as their grill-me skill, through `run-agent`. Today a run cannot ask: the prompt says there is no terminal, Claude's built-in question tool has nothing behind it, and OpenCode's is switched off. The agent guesses or ends with an unanswered question.

The owner wants an easy terminal interface for answering, and wants the work to carry over to FlowBoard's web inbox and Slack later. FlowBoard's design already splits asking into two halves: a small tool program the agent talks to (the *shim*) and a listener that gets the answer from a human (the *broker*). This design builds the shim as FlowBoard will use it, and makes `run-agent` a terminal broker. Later the worker becomes the broker, and the shim stays unchanged.

## Goals

- During a `run-agent` run, the agent can ask the owner one question or a batch, and carries on with the answers in the same run.
- Answering in the terminal is easy (owner's words), as played back and confirmed:
  - while a question is open, event lines stop scrolling and the question stands on its own, its help text under it;
  - batches come one question at a time, labelled `question 2 of 4`;
  - `yes_no`: arrow keys, or `y` / `n`;
  - `single_select`: arrow keys and Enter, or type the option's number;
  - `multi_select`: arrow keys to move, Space to tick, Enter to finish;
  - `text`: type, Enter;
  - `number`: type a number; anything else asks again;
  - an optional `text` or `number` question is skipped with an empty answer; an optional `yes_no` or `single_select` list ends with a `Skip` entry; an optional `multi_select` with nothing ticked counts as skipped (my calls);
  - a required question cannot be skipped; a required `multi_select` needs at least one tick (`Question Shapes.md`: pick-many is answered only with at least one option).
- The run waits for an answer as long as it takes, with no timeout (owner's decision).
- The shim, its tools and the question shape are exactly what the web inbox and Slack escalation will use later, so only the broker changes then.
- The owner's standalone grill-me skill (`~/.agents/repos/mattpocock-skills/skills/productivity/grill-me`, a folder with a `SKILL.md`, not part of a plugin) can be used from a YAML file (owner's decision).

## Non-goals

- Park and resume: the full design's 20-minute hand-off, where the agent saves its place and resumes later. The terminal broker just waits.
- The web inbox, Slack, the `questions` table and the escalation timer. These belong to the worker broker later.
- The design's other two agent tools, `declare_artifact` and `set_outcome`. They wait until something needs them (my call).
- Answering from anywhere but the terminal that started the run.

## Anti-goals

- A terminal-only shortcut (for example, hooking Claude's built-in question tool) that would not carry over to OpenCode, the web inbox or Slack.
- A question that silently disappears because a tool-call time limit gave up on it while the owner was thinking.
- A restrictive `permissions.allow` list that locks the agent out of asking.
- An answer the agent cannot use: a `number` question answered with text, or a required question left empty.

## Constraints

- Same code rules as the rest of `packages/`: TypeScript on Node 24 type stripping, erasable syntax only, `node:test`, pnpm workspaces, commands run from `code/flowboard/`.
- The shim never opens a database and needs no network: it talks only to the broker over a local Unix socket (`Ask User MCP Server.md`: *"It never opens the database and needs no network."*).
- The question shape is FlowBoard's (`Questions.md`), defined once:

  ```ts
  type QuestionKind = 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number';
  interface QuestionOption { value: string; label: string }
  interface Question {
    id: string; prompt: string; help?: string; kind: QuestionKind;
    options?: QuestionOption[]; // the select kinds
    required?: boolean;         // default true
  }
  ```

- Automated tests spend nothing. Live checks are opt-in, as for the providers.
- Runs spend quota or money, but waiting for an answer does not: the model is idle while the tool call is open.

## The how, as decided

### The shim: `packages/ask-user` (`@flowboard/ask-user`)

A stdio MCP server (my call: `@modelcontextprotocol/sdk`, already in the workspace) launched by the agent's CLI. It offers two tools, as the design names them:

- `ask_user({ question })`: one question; returns `{ answers: { [id]: value } }`.
- `ask_user_batch({ questions })`: several; blocks until every required one is answered; same return.

Answer values: `yes_no` → boolean, `single_select` → the option's `value`, `multi_select` → an array of values, `text` → string, `number` → number; a skipped optional question → `null` (my call). The shim checks the agent's input (ids unique, select kinds have options) and returns a tool error for bad input rather than forwarding it (my call).

It forwards each call over the Unix socket named by the environment variable `FLOWBOARD_ASK_SOCKET` and relays the reply (my call on the name). Protocol (my call): newline-delimited JSON, one request per connection: `{ "questions": Question[] }` → `{ "answers": {...} }` or `{ "error": "<message>" }`. The shim turns `{ error }` into a tool error and relays **any other reply verbatim** as the tool result, so the worker broker's later park reply, `{ "status": "no_answer_yet", "instruction": … }` (`Ask Park And Resume.md`), passes through without changing the shim (my call). The question and protocol types, that park reply included, live in `@flowboard/core` (`hitl/question.ts`), so the worker broker later uses the same ones.

### The broker: `run-agent`

For each run, `run-agent`:

1. creates a private temp dir under `/tmp` and listens on `<dir>/ask.sock` (my call: macOS's default temp folder, `/var/folders/…`, is too long for the roughly 104-character Unix socket path limit);
2. adds the shim to the run as a tool server: `RunSpec.tools = [{ name: 'flowboard', command: process.execPath, args: [<abs path to the shim's entry>], env: { FLOWBOARD_ASK_SOCKET } }]`. Both adapters already inject tool servers and always allow their tools, so a strict `allow` list cannot lock asking out (Claude: `mcp__flowboard__*`; OpenCode: config `mcp`);
3. on a request: holds back event lines, shows the questions one at a time as in *Goals*, then sends the answers back and prints the held lines. Requests that arrive while another is on screen (Claude's parallel tool calls, subagents) wait in a first-in-first-out queue (my call);
4. when a request's connection closes, or the run ends, while its question is on screen or queued (a CLI time limit fired anyway, a budget or turn limit, a crash): cancels the prompt, restores the terminal, prints `-- question withdrawn: the agent stopped waiting`, and logs it, so a question never disappears silently (my call, from the anti-goal);
5. logs `{"kind":"question","at":…,"questions":[…]}`, `{"kind":"answer","at":…,"answers":{…}}` and `{"kind":"withdrawn","at":…}` lines to the run's JSONL log (my call);
6. closes the socket and deletes the dir when the run ends.

Terminal prompts use `@inquirer/prompts` (my call: arrow-key lists and checkboxes need raw-mode keyboard handling, which this library already does well). Ctrl+C while a question is on screen stops the run like any Ctrl+C. In raw mode the terminal does not send SIGINT, so the library's own Ctrl+C has to be wired to the same stop. When stdin is not a terminal, the broker answers with an error, *"No one can answer questions in this run."*, so the agent carries on instead of hanging (my call).

### No timeouts

The agent's CLI must not give up on an open `ask_user` call:

- **Claude:** the MCP tool-call time limit (Claude Code's `MCP_TOOL_TIMEOUT` setting) is set high enough to never trigger, in the env `buildQuery` gives the CLI.
- **OpenCode:** 1.19.3's config has a per-server `mcp.<name>.timeout` and `experimental.mcp_timeout` (both in `@opencode-ai/sdk`'s `types.gen.d.ts`); whichever governs a running tool call is set likewise.

These live in the adapters, not the CLI, since any tool server that waits on a human needs them (my call). The builder confirms on the real CLIs which setting governs a running tool call, and that a call held open for several minutes still returns. If one cannot be lifted, the withdrawn-question path above makes the failure visible.

### Built-in question tools are switched off

So the agent always asks through `ask_user`:

- OpenCode's `question` tool is already denied.
- `run-agent` adds Claude's built-in `AskUserQuestion` to every Claude run's deny list (my call).

### The prompt's closing line

Replaces *"This is a headless run: there is no terminal to ask into. Do the task, then stop."* with (my call on wording):

> *"You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop."*

### Standalone skills: the `skills:` YAML field

Added because the owner's grill-me is a standalone skill folder (owner's decision):

```yaml
skills:
  - ~/.agents/repos/mattpocock-skills/skills/productivity/grill-me
skill: /grill-me
```

- `skills:` is a list of skill folders, each an existing directory holding a `SKILL.md`. Paths follow the same rules as `plugins:` (relative to the folder the command runs from; `~/` expands). It sits alongside `plugins:`.
- A skill's name is its folder name, and the `name:` in its `SKILL.md` frontmatter must match it, since OpenCode may load skills by that name (my call); two entries with the same name are a config error.
- For each run, `run-agent` copies the folders into `<temp>/local/skills/<name>/`, with `<temp>` under `/tmp` and passed as its real path so the Claude provider's plugin-loaded check, which does not follow links, matches (my call) and mounts `<temp>/local` as a `plugin_dir` capability (my calls: a copy, not a link, because both CLIs handle links unreliably and the providers' plugin-loaded check ignores them; the plugin is named `local`). The temp dir is deleted when the run ends. The copy is fresh each run, so edits to the skill apply next time.
- `skill:` may now name such a skill as `/<name>` with no colon. `run-agent` rewrites it to `/local:<name>`. A colon-less `skill` that names no `skills:` entry is a config error. `/plugin:skill` works as before.
- A `plugins:` entry whose folder is named `local` clashes with this and is a config error.

## Testing

All free:

- the shim, driven by an MCP client from the SDK, against a fake socket broker;
- the broker's socket and protocol handling;
- the answer rules (value types, optional skip, `number` re-ask), through a seam that lets a test supply the answers instead of the terminal;
- the `skills:` validation and copying;
- the closing line and the injected tool server and deny entry in the `RunSpec`.

Live and opt-in: one Claude run and one OpenCode run whose prompt makes the agent call `ask_user`, answered through the test seam, checking that the answer reaches the agent. By hand, the owner's grill-me run from a terminal, which no automated test can drive.

## Documentation

Update the vault notes to match:

- `Run Config Reference.md`: the `skills:` field, the colon-less `skill`, the new closing line, the question log lines;
- `Testing The Run Agent CLI.md`: an example grill-me YAML and an answering scenario;
- `Run Agent CLI Decisions.md`: the calls above.

## Left to the builder

- The module split inside `packages/ask-user` and in the CLI's broker, and the exact test seam for supplying answers.
- How held-back event lines are printed after the answers.
- The exact timeout settings, once confirmed on the real CLIs.
- Whether the shim's entry point needs anything beyond `node <path>` to run under each CLI (it is spawned from the run's folder, not the repo).
