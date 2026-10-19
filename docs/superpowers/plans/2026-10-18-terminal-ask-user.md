# Terminal ask_user Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a `run-agent` run the agent can ask the owner questions through an `ask_user` / `ask_user_batch` MCP tool, answered in the terminal, and a YAML can mount standalone skill folders (`skills:`), so the owner's grill-me runs.

**Architecture:** FlowBoard's two halves. A new stdio MCP server, the shim (`packages/ask-user`), forwards each question over a per-run Unix socket to a broker. `run-agent` is the broker: it queues requests, asks them in the terminal with `@inquirer/prompts`, and replies. The question and protocol types live in `@flowboard/core`, so the worker broker later reuses them and the shim. The adapters lift their MCP tool-call time limits.

**Tech Stack:** TypeScript on Node 24 type stripping, `node:test`, pnpm workspaces, `@modelcontextprotocol/sdk` 1.32.x, `zod` 4.6.x, `@inquirer/prompts` 8.x, `node:net` Unix sockets.

**Spec:** `docs/superpowers/specs/2026-10-18-terminal-ask-user-design.md`

## Global Constraints

- Code rules: erasable syntax only, `import type` for types, `.ts` relative imports, `node:test` + `node:assert/strict`; commands run from `code/flowboard/`.
- Question shape exactly: `QuestionKind = 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number'`; `Question { id; prompt; help?; kind; options?: { value; label }[]; required? /* default true */ }`.
- Answer values: `yes_no` → boolean, `single_select` → option `value`, `multi_select` → `string[]`, `text` → string, `number` → number, skipped optional → `null`.
- Tool names `ask_user({ question })` and `ask_user_batch({ questions })`; both return `{ answers: { [id]: value } }`. MCP server name in `RunSpec.tools`: `flowboard`.
- Socket env var: `FLOWBOARD_ASK_SOCKET`. Protocol: newline-delimited JSON, one request per connection, `{ "questions": Question[] }` → `{ "answers": {...} }` | `{ "error": "<message>" }` | any other object (relayed verbatim; the park reply is `{ "status": "no_answer_yet", "instruction": string }`).
- New closing line, verbatim: `You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop.`
- Withdrawn line, verbatim: `-- question withdrawn: the agent stopped waiting`. Non-terminal error, verbatim: `No one can answer questions in this run.`
- Log lines: `{"kind":"question","at","questions"}`, `{"kind":"answer","at","answers"}`, `{"kind":"withdrawn","at"}`.
- Temp dirs (socket, skills plugin) are created under `/tmp` (`mkdtempSync('/tmp/fb-')`) and used by their `realpathSync` path; deleted when the run ends.
- Standalone skills are copied (not linked) into `<temp>/local/skills/<name>/` and mounted as a `plugin_dir` named `local`.
- Claude runs get `AskUserQuestion` appended to `toolPolicy.deny`; OpenCode runs do not (its `question` tool is already denied).
- Tool-call limits lifted with `2147483647` ms: Claude env `MCP_TOOL_TIMEOUT`; OpenCode per-server `mcp.<name>.timeout` and `experimental.mcp_timeout`.
- Automated tests spend nothing; live tests only under `FLOWBOARD_LIVE=1`.

## Review Focus

1. Events that arrive while a question is on screen (usage, a subagent's text) must not print over the prompt: they are held and printed after the answers. Test in Task 6.
2. An agent that sends malformed questions (duplicate ids, a select kind with no options, an empty list) gets a tool error back and nothing is shown to the owner. Test in Task 2.
3. Two requests at once are asked one after the other, never interleaved. Test in Task 5.
4. A run that ends (budget, crash, Ctrl+C) while a question is on screen withdraws it, aborts the prompt, and still finishes with a `result` line and the right exit code. Tests in Tasks 5 and 6.
5. A `skills:` folder with no `SKILL.md`, no frontmatter, or a `name:` that differs from the folder gives a config error line, not a stack trace. Test in Task 4.

---

### Task 1: Question and protocol types in core

**Files:**
- Create: `packages/core/src/hitl/question.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Test: `packages/core/test/question.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QuestionKind = 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number';
  export interface QuestionOption { value: string; label: string }
  export interface Question { id: string; prompt: string; help?: string; kind: QuestionKind; options?: QuestionOption[]; required?: boolean }
  export type AnswerValue = boolean | string | string[] | number | null;
  export type Answers = Record<string, AnswerValue>;
  export interface AskRequest { questions: Question[] }
  export type AskReply = { answers: Answers } | { error: string } | { status: 'no_answer_yet'; instruction: string };
  /** First problem found, or undefined when the batch is askable. */
  export function checkQuestions(questions: Question[]): string | undefined;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test('a valid batch passes', () => assert.equal(checkQuestions([{ id: 'a', prompt: 'A?', kind: 'text' }]), undefined));
test('an empty batch is refused', () => assert.equal(checkQuestions([]), 'no questions'));
test('duplicate ids are refused', () => assert.equal(checkQuestions([q('a'), q('a')]), 'duplicate question id "a"'));
test('a select kind needs options', () =>
  assert.equal(checkQuestions([{ id: 's', prompt: 'S?', kind: 'single_select' }]), 'question "s" needs options'));
test('an empty prompt is refused', () => assert.equal(checkQuestions([{ id: 'a', prompt: ' ', kind: 'text' }]), 'question "a" has no prompt'));
```

- [ ] **Step 2: Run to see them fail** — `node --test packages/core/test/question.test.ts` → FAIL, module not found.
- [ ] **Step 3: Implement `checkQuestions` and the types**; export from `packages/core/src/index.ts`.
- [ ] **Step 4: Run to see them pass** — same command plus `pnpm -s typecheck:packages` → 5/5, no type errors.
- [ ] **Step 5: Commit** — `feat(core): question and ask protocol types`.

---

### Task 2: The shim, `@flowboard/ask-user`

**Files:**
- Create: `packages/ask-user/package.json` (deps `@flowboard/core` `workspace:*`, `@modelcontextprotocol/sdk` `^1.32.1`, `zod` `^4.6.7`; `"exports": { ".": "./src/index.ts" }`)
- Create: `packages/ask-user/src/broker-client.ts`, `src/server.ts`, `src/main.ts`, `src/index.ts`
- Test: `packages/ask-user/test/shim.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `checkQuestions`.
- Produces:
  ```ts
  // broker-client.ts — one request per connection; rejects if the socket fails or closes without a reply
  export function askBroker(socketPath: string, request: AskRequest): Promise<AskReply>;
  // server.ts
  export function createAskServer(socketPath: string): McpServer; // registers ask_user and ask_user_batch
  // main.ts — reads FLOWBOARD_ASK_SOCKET (exit 1 with a message on stderr if unset), connects createAskServer to StdioServerTransport
  // index.ts
  export const SHIM_ENTRY: string; // absolute path of src/main.ts
  export { askBroker } from './broker-client.ts';
  ```
  Tool result: `{ content: [{ type: 'text', text: JSON.stringify(reply) }] }`; for `{ error }`, or a failed `checkQuestions`, or a broker that cannot be reached: `{ isError: true, content: [{ type: 'text', text: <message> }] }`.

- [ ] **Step 1: Write the failing tests**

Each test starts a fake broker (`net.createServer` on a socket in `mkdtempSync('/tmp/fb-')`) that records requests and answers with a scripted reply, then connects an SDK `Client` through `StdioClientTransport({ command: process.execPath, args: [SHIM_ENTRY], env: { ...process.env, FLOWBOARD_ASK_SOCKET } })`.

```ts
test('lists ask_user and ask_user_batch', async () => { /* listTools → names deepEqual ['ask_user', 'ask_user_batch'] (sorted) */ });
test('ask_user forwards one question and returns the answers', async () => {
  // broker replies { answers: { color: 'teal' } }
  // callTool ask_user { question: { id: 'color', prompt: 'Colour?', kind: 'text' } }
  // → broker saw { questions: [that question] }; JSON.parse(result.content[0].text) deepEqual { answers: { color: 'teal' } }; !result.isError
});
test('ask_user_batch forwards the whole batch', async () => { /* two questions in one request */ });
test('a broker error becomes a tool error', async () => { /* reply { error: 'nope' } → isError, text 'nope' */ });
test('an unknown reply is relayed verbatim', async () => {
  // reply { status: 'no_answer_yet', instruction: 'Write your state.' } → !isError, parsed text deepEqual the reply
});
test('malformed questions never reach the broker', async () => {
  // ask_user_batch with duplicate ids → isError, text 'duplicate question id "a"'; broker saw no request
});
test('an unreachable broker is a tool error', async () => { /* socket path that does not exist → isError, text matches /broker/ */ });
```

- [ ] **Step 2: Run to see them fail** — `pnpm install && node --test packages/ask-user/test/shim.test.ts` → FAIL, module not found.
- [ ] **Step 3: Implement** with `McpServer.registerTool` (zod input schemas mirroring `Question`); no timeout on the socket wait.
- [ ] **Step 4: Run to see them pass** — same test file plus `pnpm -s typecheck:packages` → 7/7.
- [ ] **Step 5: Commit** — `feat(ask-user): MCP shim forwarding ask_user to a broker socket`.

---

### Task 3: Adapters lift the tool-call time limits

**Files:**
- Modify: `packages/adapters/src/agent/claude/options.ts`, `packages/adapters/src/agent/opencode/options.ts`
- Test: `packages/adapters/test/claude-options.test.ts`, `packages/adapters/test/opencode-options.test.ts`

**Interfaces:**
- Produces: Claude `options.env.MCP_TOOL_TIMEOUT === '2147483647'` on every run. OpenCode: every `config.mcp[name].timeout === 2147483647` and `config.experimental.mcp_timeout === 2147483647` (keeping `continue_loop_on_deny: true`).

- [ ] **Step 1: Write the failing tests** — `'tool calls have no time limit'` in each file, asserting the values above for a spec with one tool server.
- [ ] **Step 2: Run to see them fail** — `node --test packages/adapters/test/claude-options.test.ts packages/adapters/test/opencode-options.test.ts` → the two new tests FAIL.
- [ ] **Step 3: Implement.** If `Config`'s type rejects either OpenCode key, check `@opencode-ai/sdk`'s `types.gen.d.ts` for the exact name and ledger a ruling.
- [ ] **Step 4: Run to see them pass** — same command plus `pnpm -s typecheck:packages`.
- [ ] **Step 5: Commit** — `feat(adapters): no time limit on MCP tool calls, so a question can wait for a human`.

---

### Task 4: CLI config — closing line and `skills:`

**Files:**
- Modify: `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts`

**Interfaces:**
- Consumes: existing `loadConfig`.
- Produces: `CLOSING` changed to the Global Constraints text; `RunConfig` gains `skills: { name: string; path: string }[]` (absolute source folders, `[]` when none); a colon-less `skill: /<name>` naming a `skills:` entry becomes `spec.prompt.invocation === '/local:<name>'`. Capability mounting is Task 6's job, not `loadConfig`'s.

New checks (field: message):

| Field | Check | Message |
|---|---|---|
| `skills.<i>` | existing directory | `not a directory: <abs>` |
| `skills.<i>` | has `SKILL.md` | `no SKILL.md in <abs>` |
| `skills.<i>` | `SKILL.md` frontmatter has `name:` equal to the folder name | `SKILL.md name "<n>" does not match folder "<folder>"` (or `SKILL.md has no name`) |
| `skills.<i>` | name not already used by an earlier entry | `duplicate skill name "<n>"` |
| `skill` | colon-less and no `skills:` entry of that name | `no skill "<n>" in skills` |
| `plugins.<i>` | folder named `local` while `skills:` is set | `plugin folder name "local" is reserved for skills` |

- [ ] **Step 1: Write the failing tests** — the full-mapping test's `closing` now uses the new `CLOSING`; plus:

```ts
test('skills: entries load and a plain skill name becomes /local:<name>', () => {
  // project with skills/grill-me/SKILL.md ("---\nname: grill-me\ndescription: x\n---\nAsk.") ;
  // YAML: skills: [skills/grill-me], skill: /grill-me
  // → config.skills deepEqual [{ name: 'grill-me', path: join(base, 'skills/grill-me') }]; spec.prompt.invocation === '/local:grill-me'
});
// one test per table row, each deepEqual-ing the single error line
```

- [ ] **Step 2: Run to see them fail** — `node --test packages/cli/test/config.test.ts`.
- [ ] **Step 3: Implement**; parse the frontmatter (text between the leading `---` lines) with `yaml`'s `parse`.
- [ ] **Step 4: Run to see them pass** — same plus `pnpm -s typecheck:packages`.
- [ ] **Step 5: Commit** — `feat(cli): skills: field for standalone skill folders; ask-through-the-tool closing line`.

---

### Task 5: The broker and the terminal answerer

**Files:**
- Create: `packages/cli/src/ask/broker.ts`, `packages/cli/src/ask/terminal.ts`
- Modify: `packages/cli/package.json` (deps `@inquirer/prompts` `^8.7.3`, `@flowboard/ask-user` `workspace:*`)
- Test: `packages/cli/test/broker.test.ts`, `packages/cli/test/terminal.test.ts`

**Interfaces:**
- Consumes: Task 1 types; Task 2 `askBroker` (tests use it as the client).
- Produces:
  ```ts
  // broker.ts
  /** Answers one batch; rejects with an error whose name is 'ExitPromptError' when the owner pressed Ctrl+C. Must stop when `signal` aborts. */
  export type Answerer = (questions: Question[], signal: AbortSignal) => Promise<Answers>;
  export interface BrokerEvents {
    onQuestion(questions: Question[]): void;   // a batch is about to be shown
    onAnswer(answers: Answers): void;
    onWithdrawn(): void;                        // its connection closed, or the broker closed, first
    onDone(): void;                             // no batch on screen or queued any more
    onInterrupt(): void;                        // the answerer reported Ctrl+C
  }
  export function startBroker(socketPath: string, answer: Answerer, events: BrokerEvents): Promise<{ close(): Promise<void> }>;
  // terminal.ts
  export const noTerminal: Answerer;           // rejects with Error('No one can answer questions in this run.')
  export function terminalAnswerer(prompts?: Prompts, print?: (line: string) => void): Answerer; // default: @inquirer/prompts' select, checkbox, input
  export interface Prompts { select: typeof select; checkbox: typeof checkbox; input: typeof input }
  /** text/number input rules: the value, or a message to show and ask again. */
  export function parseTyped(q: Question, raw: string): { ok: true; value: AnswerValue } | { ok: false; message: string };
  ```
  Broker rules: requests are handled first-in-first-out, one at a time; a malformed request line gets `{ error }`; an answerer rejection other than `ExitPromptError` replies `{ error: <message> }`; `ExitPromptError` calls `onInterrupt` and replies `{ error: 'stopped' }`.
  Terminal rules: before each question print `question <i> of <n>` (only when `n > 1`), then the prompt with `help` as the prompt's description/message suffix; `yes_no` → `select` with `Yes`/`No` (+ `Skip` when optional); `single_select` → `select` over the options (+ `Skip`); `multi_select` → `checkbox`, `required: true` when the question is required, nothing ticked on an optional one → `null`; `text`/`number` → `input` with `validate` from `parseTyped` (empty + optional → `null`; empty + required → `answer required`; `number` not a finite number → `enter a number`). Pass `{ signal }` as the prompts' context.

- [ ] **Step 1: Write the failing tests**

`broker.test.ts` (socket in `mkdtempSync('/tmp/fb-')`, client = `askBroker`):

```ts
test('a request is answered by the answerer', async () => { /* answerer returns { a: 'x' } → reply { answers: { a: 'x' } }; events onQuestion, onAnswer, onDone in order */ });
test('two requests at once are answered one after the other', async () => {
  // answerer records start/end per batch with a small delay; two concurrent askBroker calls
  // → starts and ends never overlap (end of first before start of second); both get their own answers
});
test('a dropped connection withdraws its question and aborts the prompt', async () => {
  // answerer awaits signal abort; client socket destroyed mid-question → onWithdrawn called; signal.aborted
});
test('close() withdraws a question on screen', async () => { /* close while answering → onWithdrawn; signal aborted; close resolves */ });
test('Ctrl+C in the prompt interrupts the run', async () => { /* answerer rejects Object.assign(new Error('x'), { name: 'ExitPromptError' }) → onInterrupt; reply { error: 'stopped' } */ });
test('a malformed request gets an error reply', async () => { /* raw socket sends 'not json\n' → reply has error */ });
```

`terminal.test.ts` (fake `Prompts` recording each call's config and returning scripted values):

```ts
test('parseTyped: numbers, empties and text', () => {
  // number '42' → 42; number 'abc' → { ok: false, message: 'enter a number' }; required '' → 'answer required';
  // optional '' → { ok: true, value: null }; text ' hi ' → 'hi'
});
test('a batch shows "question i of n" and the help text', async () => { /* printed lines include 'question 1 of 2', 'question 2 of 2'; prompt message or description contains help */ });
test('yes_no maps to Yes/No and returns a boolean; optional adds Skip → null', async () => {});
test('single_select returns the option value; optional adds Skip → null', async () => {});
test('multi_select: required needs a tick; optional with none ticked → null', async () => {});
test('noTerminal refuses with the fixed message', async () => {});
```

- [ ] **Step 2: Run to see them fail** — `pnpm install && node --test packages/cli/test/broker.test.ts packages/cli/test/terminal.test.ts`.
- [ ] **Step 3: Implement both modules.**
- [ ] **Step 4: Run to see them pass** — same plus `pnpm -s typecheck:packages`.
- [ ] **Step 5: Commit** — `feat(cli): terminal broker for ask_user questions`.

---

### Task 6: Wire the broker and skills into `runAgent`

**Files:**
- Modify: `packages/cli/src/run.ts`
- Test: `packages/cli/test/run.test.ts`

**Interfaces:**
- Consumes: Task 2 `SHIM_ENTRY`, `askBroker`; Task 4 `RunConfig.skills`; Task 5 `startBroker`, `terminalAnswerer`, `noTerminal`, `Answerer`.
- Produces: `RunDeps.answer?: Answerer` (default `process.stdin.isTTY ? terminalAnswerer() : noTerminal`). Per run, before launch:
  - `tmp = realpathSync(mkdtempSync('/tmp/fb-'))`; broker on `<tmp>/ask.sock`;
  - `spec.tools = [...(spec.tools ?? []), { name: 'flowboard', command: process.execPath, args: [SHIM_ENTRY], env: { FLOWBOARD_ASK_SOCKET: <socket> } }]`;
  - for `claude-code`: `spec.toolPolicy = { ...spec.toolPolicy, deny: [...(spec.toolPolicy?.deny ?? []), 'AskUserQuestion'] }`;
  - when `skills` is non-empty: `cpSync(path, <tmp>/local/skills/<name>, { recursive: true })` each, and append capability `{ id: 'local', provider: adapter, mount: { kind: 'plugin_dir', path: <tmp>/local } }`.
  The `start` log line records the spec as launched (tools included). While a batch is on screen, event lines are held (logged at once, printed after `onDone`). `onQuestion`/`onAnswer`/`onWithdrawn` write the log lines; `onWithdrawn` prints the withdrawn line; `onInterrupt` runs the same handler as a SIGINT. In `finally`: `broker.close()`, then `rmSync(tmp, { recursive: true, force: true })`.

- [ ] **Step 1: Write the failing tests**

A test helper `askingProvider(questions, then)`: a fake `AgentProvider` whose `launch(spec)` finds the `flowboard` tool's `FLOWBOARD_ASK_SOCKET`, calls `askBroker`, and yields `assistant_text` with `JSON.stringify(reply)`, then a `result`.

```ts
test('the agent gets the answer and the log records question and answer', async () => {
  // deps.answer = async () => ({ color: 'teal' }); YAML adapter claude-code
  // → exit 0; an assistant_text line contains '"teal"'; log kinds include 'question' then 'answer' before 'result'
});
test('the shim is injected and Claude's built-in question tool is denied', async () => {
  // start line config.tools[0] has name 'flowboard', args [SHIM_ENTRY]; config.toolPolicy.deny includes 'AskUserQuestion'
});
test('opencode runs get the shim but no AskUserQuestion deny', async () => {});
test('events during a question print after it is answered', async () => {
  // provider emits an assistant_text 'during' while its ask is pending (emit, then await the reply);
  // answerer records out.length at call time → 'during' line index > that length
});
test('a run that ends mid-question withdraws it and still exits with a result', async () => {
  // provider starts an ask, then throws from events without awaiting → out includes the withdrawn line;
  // log has a 'withdrawn' line and a final 'result'; exit 1; answerer's signal aborted
});
test('Ctrl+C at a question stops the run with 130', async () => {
  // answerer rejects with name 'ExitPromptError'; ReplayProvider-like fake honours stop() → exit 130, '-- stopping' printed
});
test('skills are copied into a local plugin and the temp dir is removed afterwards', async () => {
  // YAML skills + skill: /grill-me; provider captures spec → capability { id: 'local', mount.path ends with '/local' };
  // <path>/skills/grill-me/SKILL.md existed during the run; after runAgent the temp dir is gone
});
test('without a terminal the agent is told no one can answer', async () => {
  // deps.answer = noTerminal → assistant_text contains 'No one can answer questions in this run.'
});
```

- [ ] **Step 2: Run to see them fail** — `node --test packages/cli/test/run.test.ts`.
- [ ] **Step 3: Implement in `run.ts`.**
- [ ] **Step 4: Run the whole suite** — `pnpm -s typecheck:packages && pnpm -s test:packages` → `fail 0`.
- [ ] **Step 5: Commit** — `feat(cli): run-agent answers ask_user questions in the terminal and mounts skills: folders`.

---

### Task 7: Live checks and docs

**Files:**
- Create: `packages/cli/test/ask-live.test.ts`
- Modify: `code/flowboard/package.json` (`test:live` gains the file)
- Modify (vault): `docs/FlowBoard/Agent Providers/Run Config Reference.md`, `Testing The Run Agent CLI.md`, `Run Agent CLI Decisions.md`

**Interfaces:**
- Consumes: `runAgent` with `deps.answer`.

- [ ] **Step 1: Write the live tests** (`{ skip: !process.env.FLOWBOARD_LIVE, timeout: 600_000 }`)

```ts
for (const [adapter, model] of [['claude-code', 'haiku'], ['opencode', FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash']]) {
  test(`${adapter}: the agent asks and uses the answer`, live, async () => {
    // task.md: 'Ask the user for their favourite colour with the ask_user tool (a text question, id "colour"), then reply with exactly that colour.'
    // deps.answer = async () => ({ colour: 'teal' }); limits { max_turns: 4, budget_usd: 0.2 }
    // → exit 0; log has a 'question' line; an assistant_text contains 'teal'
  });
}
test('claude-code: a question can wait six minutes', { ...live, skip: !process.env.FLOWBOARD_LIVE_SLOW, timeout: 900_000 }, async () => {
  // same as above, answerer resolves after 360_000 ms → still exit 0 and 'teal'
});
// and the same slow test for opencode
```

- [ ] **Step 2: Run them** — `FLOWBOARD_LIVE=1 node --test packages/cli/test/ask-live.test.ts` → 2/2 pass. Then `FLOWBOARD_LIVE=1 FLOWBOARD_LIVE_SLOW=1 node --test --test-name-pattern "six minutes" packages/cli/test/ask-live.test.ts` → 2/2 pass. If a slow test fails, the Task 3 setting is wrong for that CLI: find the right one, fix it test-first in Task 3's files, ledger a ruling.
- [ ] **Step 2b: Check the keys by hand** — the spec's `y` / `n` for `yes_no` and option numbers for `single_select` depend on what `@inquirer/prompts`' `select` supports; try them in a terminal against a small script calling `terminalAnswerer()`. If a key is missing, ledger a ruling (and note it in the Reference) rather than building a custom prompt.
- [ ] **Step 3: Update the vault notes** — Reference: `skills:` row, colon-less `skill`, the new closing line, the three log kinds, a section *Asking the owner*; Testing: an example `grill-me.yaml` (skills + `skill: /grill-me`, Claude haiku) and scenario *Answering questions*; Decisions: rows for the calls in the spec marked *my call*.
- [ ] **Step 4: Confirm skips by default** — `pnpm -s test:packages` → `fail 0`, live tests skipped.
- [ ] **Step 5: Commit** — `test(cli): live-check ask_user on both adapters; document asking`.
