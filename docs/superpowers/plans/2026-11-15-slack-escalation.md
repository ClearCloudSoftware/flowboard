# Slack Escalation Implementation Plan (projects phase 6: a waiting question reaches Slack, and is answered there)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project's *Escalation* setting (`{ channel, nudgeMin }`) stops being stored-and-ignored. A question a run
asks the page, left unanswered for `nudgeMin` minutes, is posted to the project's Slack channel; it can be answered
there (an **Answer** button opens a modal) as well as in Lamproom, the first answer wins, and the Slack message is
repainted when the question is answered anywhere or stops waiting. A project's monthly budget alert and cap are posted
once each per month. Alex's decision: *"Answer in Slack too"*, over Socket Mode, as there is no public URL.

**Architecture:** Everything lives in the Next server process. Phase 5's `instrumentation.ts` also calls
`startEscalation`, which (once per process, a `globalThis` guard) keeps a Socket Mode connection to Slack open while
both tokens are saved and runs `escalationTick` every 15 seconds. A tick reads the run folders as the runs page does
(`listRuns`, `readRun`): each open ask (`<runDir>/asks/<id>.json`) of a `waiting` run older than its project's
resolved `nudgeMin` is posted with `chat.postMessage`; each escalated ask that is gone is repainted with `chat.update`.
The message refs live in `<dataDir>/escalations.json`, never in a run folder or a repo. An answer from Slack's modal is
written with `answerAsk`, the page's own path; `answerAsk` now writes its file exclusively, so the first answer wins.
The page's answer route tells the escalation module, which repaints at once. Run-flow is unchanged.

**Tech Stack:** TypeScript on Node 24 with type stripping (global `fetch` and `WebSocket`), `node --test`, zod 4,
Next 16 (`instrumentation.ts`, route handlers) + TanStack Query + shadcn/ui + lucide-react. Slack Web API
(`auth.test`, `apps.connections.open`, `chat.postMessage`, `chat.update`, `views.open`), Socket Mode, Block Kit.

**Spec:** `docs/old/PRD.MD` §10 (lines 459-489), `docs/Lamproom/Escalation And Notifications/` (Overview, Slack
Adapter, Notifier Port, Escalation Threshold), `docs/Lamproom/Human In The Loop/Escalation To Chat.md`, the
controller's brief of 2026-11-15 (defaults 1-11) and Alex's decision *"Answer in Slack too"*.

**Not in this plan:** Discord, Google Chat, email, webhook and desktop channels (they stay *coming soon*); the
`/inbox` page; the HTTP interactions endpoint and its signing secret (Socket Mode replaces both); a Notifier port with
one adapter (YAGNI: one channel, one module); undo; per-person routing; posting asks of runs not started with `--page`
(they have no asks files).

## Global Constraints

- All paths are under `code/lamproom/` unless they start with `docs/`. Run commands from `code/lamproom/`.
- Branch `feature/slack-escalation`, cut from `feature/knowledge-assets` at `87f0f70` in
  `.claude/worktrees/slack-escalation`. Never merge (except `git merge feature/knowledge-assets` when asked), never push.
- No new npm dependencies. Socket Mode uses Node's global `WebSocket`; tests use a hand-written RFC 6455 server.
- **Credentials** live in `<dataDir>/secrets.json` (0o600) beside `openrouter`: `slackBot` (`xoxb-…`) and `slackApp`
  (`xapp-…`). Saving or removing one key keeps the others. No page or API answer ever carries a token back.
- **Message refs** live in `<dataDir>/escalations.json`. Nothing is written into a run folder except the answer file
  `answerAsk` already writes.
- **Hostile text:** questions come from agents that read untrusted repos. Every question, option, heading, project and
  run name goes into Block Kit as `plain_text`; the only mrkdwn is the message's fallback `text`, which escapes `&`, `<`,
  `>`. Lengths are cut to Block Kit's limits (header 150, section text 3000, input label 2000, hint 2000, option text 75,
  option value 150 → indexes instead, modal title 24, button text 75, `private_metadata` 3000, 50 blocks a message,
  100 options a select, 10 radio buttons). `unfurl_links: false, unfurl_media: false`. No artifact bodies or file
  contents.
- **Slack is optional.** Without a bot token an ask is logged once to the server console and the run goes on. No Slack
  failure (network, bad token, `not_in_channel`) may throw out of a tick or crash the server.
- **Envelopes are checked**: `payload.api_app_id` must equal the `connection_info.app_id` of Socket Mode's `hello`, and
  `payload.team.id` the `team_id` of `auth.test`; others are acked and ignored. Every envelope is acked by `envelope_id`.
- The Web API base is `SLACK_API_URL`, else `https://slack.com/api`; every function that calls Slack takes `base`.
- Light only, zero radius, house tokens, Lucide icons, pages outside `.fd`, test locators scoped to `main:visible`.
  Spend no money: no real agent runs; hand-made run folders.
- Copy, exact:
  - console, no token: `-- escalation: <project>: <run> asks "<first prompt, 80 chars>"; Slack is not connected, so it waits in Lamproom`
  - message header: `Lamproom: a question is waiting`; context: `<project> · run <run> · <step>`
  - buttons: **Answer** (primary), **Open in Lamproom** (link to `<address>/runs?run=<run>`)
  - modal title `Answer Lamproom`, submit `Send`, cancel `Cancel`
  - repaint: `Answered in Slack by <user>` / `Answered in Lamproom` / `Answered in the terminal`, then one line per
    question `<prompt>: <answer>` (`Yes`/`No`, option labels joined `, `, `skipped`); `No longer waiting: the run ended`
  - modal or click after the fact: `Already answered in <Slack|Lamproom|the terminal>.` / `No longer waiting.`
  - number input not a number: `a number, like 3 or 2.5`
  - budget alert: `<project> has spent <pct>% of its $<cap> for <Month YYYY>.`
  - budget cap, pause: `<project> has spent $<spent> of its $<cap> for <Month YYYY>; new runs are paused until <Next Month YYYY>.`
  - budget cap, ask: `<project> has spent $<spent> of its $<cap> for <Month YYYY>; new runs ask first, and Start anyway is on the runs page: <address>/runs`
  - channel problem: `Slack: <channel>: <why>` with why `the bot is not in the channel; invite it with /invite @Lamproom`
    (`not_in_channel`), `no such channel` (`channel_not_found`), `the channel is archived` (`is_archived`), else Slack's error code

## Review Focus

1. **Two answers at once** (the page and Slack's modal within the host's 400 ms poll): the first file wins, the second
   is told *already answered*. Pinned in Task 4 (`answerAsk` writes with `wx`).
2. **An agent's question built to break the message**: a 5000-character prompt, 300 options, option values over 150
   characters, `<!channel>` and `<https://evil|click>` in a label. Cut to limits, option values sent as indexes,
   nothing pings or links. Pinned in Task 3.
3. **Slack down or a bad token during a tick**: the tick records the problem, keeps the ask un-posted, retries a minute
   later, and never throws. Pinned in Task 4.
4. **An envelope from another app or workspace** (or a garbage frame): acked and ignored, nothing written. Pinned in Task 2.
5. **The run is stopped or crashes while its question is in Slack**: the message says *No longer waiting* and its
   buttons go; a late **Answer** click says so instead of opening a modal. Pinned in Task 4.

---

### Task 1: Secrets keep each other; Slack's tokens are saved, tested and removed

**Files:**
- Create: `packages/cli/src/secrets.ts`, `packages/cli/test/fake-slack.ts`, `packages/cli/test/slack.test.ts`
- Modify: `packages/cli/src/openrouter.ts` (`savedKey`, `saveKey`, `removeKey` use `secrets.ts`)
- Test: `packages/cli/test/openrouter.test.ts`, `packages/cli/test/slack.test.ts`

**Interfaces:**
- Produces: `readSecret(dataDir, name: SecretName): string | undefined`; `setSecret(dataDir, name, value: string | null): void`
  (`SecretName = 'openrouter' | 'slackBot' | 'slackApp'`; null deletes the key; the file is deleted when empty).
- Produces in `packages/cli/src/slack.ts`: `SLACK_API = process.env.SLACK_API_URL || 'https://slack.com/api'`;
  `slackCall(token, method, args?: object, base = SLACK_API): Promise<{ ok: true; [k: string]: unknown } | { ok: false; error: string }>`
  (never throws; a network failure is `{ ok: false, error: 'Slack did not answer: <message>' }`, 15 s timeout);
  `saveSlackTokens(dataDir, { bot?, app? }): { ok: true } | { ok: false; error }` (`xoxb-` / `xapp-` and no spaces);
  `removeSlack(dataDir)`; `slackTokens(dataDir): { bot?: string; app?: string }`;
  `testSlack(dataDir, base?): Promise<{ ok: true; team: string; teamId: string; bot: string } | { ok: false; error }>` (`auth.test`).
- Produces in `test/fake-slack.ts`: `fakeSlack(): Promise<{ base: string; calls: { method: string; token: string; body: any }[]; reply: Record<string, (body) => object>; ws: FakeSocket; close() }>`
  answering `auth.test`, `apps.connections.open` (url of `ws`), `chat.postMessage` (`{ ok, channel: 'C1', ts }`), `chat.update`, `views.open` by default.

- [ ] **Step 1: Failing tests**: `the OpenRouter key and Slack's tokens keep each other` (save OpenRouter, save both Slack,
  remove OpenRouter → Slack's still read; file mode 0o600; remove Slack → file gone); `a Slack token must look like one`
  (`saveSlackTokens(d, { bot: 'sk-x' })` → error naming `xoxb-`); `testSlack asks auth.test with the bot token` (fake answers
  `{ ok: true, team: 'Acme', team_id: 'T1', user: 'lamproom' }` → `{ ok: true, team: 'Acme', teamId: 'T1', bot: 'lamproom' }`;
  `invalid_auth` → `{ ok: false, error: 'Slack does not know this bot token (invalid_auth)' }`; a closed port → `Slack did not answer`).
- [ ] **Step 2:** Run `node --test packages/cli/test/slack.test.ts packages/cli/test/openrouter.test.ts`; expect FAIL (no module).
- [ ] **Step 3:** Implement `secrets.ts` (read-modify-write through `writeJsonFile(…, 0o600)`), the `slack.ts` functions above, `fake-slack.ts`.
- [ ] **Step 4:** Rerun; expect PASS.
- [ ] **Step 5:** Commit `feat(slack): tokens beside the OpenRouter key, which a save no longer wipes`.

### Task 2: Socket Mode

**Files:**
- Modify: `packages/cli/src/slack.ts`, `packages/cli/test/fake-slack.ts` (add `FakeSocket`: an `http` `upgrade` handler doing
  the RFC 6455 handshake, sending unmasked text frames, reading masked ones, answering close)
- Test: `packages/cli/test/slack.test.ts`

**Interfaces:**
- Produces: `connectSocket(o: { bot: string; app: string; base?: string; onInteraction(payload: any): Promise<object | undefined>; onState(s: SocketState): void; backoffMs?: number[] }): { close(): void }`;
  `SocketState = { state: 'connecting' } | { state: 'connected'; team: string; appId: string } | { state: 'error'; error: string }`.
  It calls `auth.test` (bot) for `team_id`, `apps.connections.open` (app) for the URL, opens a `WebSocket`, takes `app_id`
  from `hello`, answers every `{ envelope_id }` with `{ envelope_id, payload? }` (the `payload` is what `onInteraction`
  returned, for `view_submission` responses), reconnects on `disconnect` or close after `backoffMs` (default
  `[1000, 2000, 5000, 15000, 60000]`, the last repeating, reset on `hello`), and never throws.
- Consumes: `slackCall` (Task 1).

- [ ] **Step 1: Failing tests, through a real `WebSocket`**: `an interactive envelope is acked with what the handler returns`
  (fake sends hello `{ connection_info: { app_id: 'A1' } }` then `{ envelope_id: 'e1', type: 'interactive', payload: { api_app_id: 'A1', team: { id: 'T1' }, type: 'view_submission' } }`;
  handler returns `{ response_action: 'clear' }` → fake receives `{ envelope_id: 'e1', payload: { response_action: 'clear' } }`;
  `onState` saw `connecting` then `connected`); `an envelope from another app or team is acked and not handled`
  (`api_app_id: 'A2'` and `team.id: 'T9'` → acked `{ envelope_id }`, handler not called; a non-JSON frame is ignored);
  `a disconnect message reconnects` (fake sends `{ type: 'disconnect' }` → a second `apps.connections.open` and a second
  socket within `backoffMs: [10]`); `a refused app token is an error state, retried` (`apps.connections.open` → `invalid_auth`
  → `onState({ state: 'error', error: 'Slack refused the app-level token (invalid_auth)' })` and a retry).
- [ ] **Step 2:** Run the file; expect FAIL.
- [ ] **Step 3:** Implement `connectSocket`; a handler that throws still gets its envelope acked.
- [ ] **Step 4:** Rerun; expect PASS.
- [ ] **Step 5:** Commit `feat(slack): Socket Mode over Node's WebSocket, acked and reconnecting`.

### Task 3: Block Kit for an ask, its modal and its repaint

**Files:**
- Create: `packages/cli/src/slack-blocks.ts`, `packages/cli/test/slack-blocks.test.ts`

**Interfaces:**
- Consumes: `PageAsk` (`ask/page.ts`), `Question`, `Answers` (`core/hitl/question.ts`).
- Produces (pure, no I/O):
  - `askMessage(a: { project: string; run: string; ask: PageAsk; address: string }): { text: string; blocks: object[] }`
  - `askModal(a: { run: string; ask: PageAsk }): object` (a `views.open` view; `private_metadata` `JSON.stringify({ run, id })`;
    block ids `q<index>`, action id `v`; yes_no and single_select with ≤ 10 options → `radio_buttons`, more → `static_select`;
    multi → `multi_static_select`; text → `plain_text_input` (multiline); number → `plain_text_input`; option values are the index)
  - `answersFromView(ask: PageAsk, values: Record<string, Record<string, any>>): { answers: Answers } | { errors: Record<string, string> }`
  - `closedMessage(a: { project: string; run: string; ask: PageAsk; by: Where | null; answers?: Answers; slackUser?: string }): { text: string; blocks: object[] }`
    (`Where = 'Slack' | 'Lamproom' | 'the terminal'`; `by: null` → *No longer waiting: the run ended*; no actions block)
  - `noticeModal(text: string): object` (a view with no submit)
  - `stepOf(ask: PageAsk): string` (`-- review asks:` → `review`; a gate's empty heading → the prompt up to its first `:`)
  - `clip(s: string, n: number): string`; `escapeMrkdwn(s: string): string`

- [ ] **Step 1: Failing tests**: `the message is plain text with an Answer button and a link` (header copy; context
  `Scratch · run 2026-11-15T10-00-00-delivery · review`; each question a `plain_text` section with its options listed;
  actions `Answer` primary with value `<run>/<id>` and `Open in Lamproom` url `http://localhost:3000/runs?run=…`);
  `hostile text is cut and never mrkdwn` (5000-char prompt → section text ≤ 3000; `<!channel>` in a label appears
  only in `plain_text` objects; fallback `text` contains `&lt;!channel&gt;`; no block of type `mrkdwn` anywhere;
  every `text.text` within its limit); `the modal holds every question` (5 kinds → radio Yes/No, radio for 3 options,
  static_select for 12, `multi_static_select` capped at 100 options, multiline input; optional question → `optional: true`;
  option values `'0'…`; title ≤ 24); `a submitted modal becomes answers` (radio `'1'` on yes_no → `false`; index → option
  value; multi → values; number `'2.5'` → `2.5`; `'abc'` → `{ errors: { q4: 'a number, like 3 or 2.5' } }`; empty optional → `null`);
  `the repaint says where and what` (`by: 'Slack', slackUser: 'alex'` → `Answered in Slack by alex`, `decision: Approve`,
  `note: skipped`; no `actions` block; `by: null` → `No longer waiting: the run ended`).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun; expect PASS.
- [ ] **Step 5:** Commit `feat(slack): Block Kit for a waiting question, its modal and its repaint`.

### Task 4: The escalation tick, answers from Slack, and budget posts

**Files:**
- Create: `packages/cli/src/escalation.ts`, `packages/cli/test/escalation.test.ts`
- Modify: `packages/cli/src/flow-logs.ts` (`answerAsk` writes with `{ flag: 'wx' }`; `EEXIST` → `'already answered'`)
- Test: `packages/cli/test/escalation.test.ts`, `packages/cli/test/flow-logs.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3; `listRuns`, `readRun`, `answerAsk` (`flow-logs.ts`); `findProject` (`isolation.ts`);
  `readProjects`, `projectSpendUsd`, `startOf` (`projects.ts`); `resolveSettings` (`settings.ts`); `readAppSettings`;
  `budgetState`, `monthOf`, `monthName`, `nextMonthName` (`budget.ts`).
- Produces:
  - store `<dataDir>/escalations.json`: `{ asks: Record<"<run>/<id>", Escalated>; budget: Record<"<projectId>/<month>", { alert?: true; cap?: true }>; problems: Record<channel, string> }`,
    `Escalated = { project: string; channel: string; slackChannel?: string; ts?: string; triedAt: string; error?: string; closed?: { by: Where | null; at: string; answers?: Answers; slackUser?: string } }`
  - `escalationTick(dataDir, runsDir, o?: { now?: number; base?: string; log?: (l: string) => void; address?: string }): Promise<void>`
  - `noteAnswered(dataDir, runsDir, run, id, answers: Answers, by: 'Lamproom' | 'Slack', o?: { slackUser?: string; base?: string }): Promise<void>`
  - `onInteraction(dataDir, runsDir, payload: any, base?): Promise<object | undefined>` (Socket Mode's handler)
  - `slackProblems(dataDir, channel: string): string[]` (the copy's channel problem line, for the project page)
  - `readEscalations(dataDir)` for the pages.
- Behaviour pinned: an ask escalates when its run is `waiting`, `readRun(...).page`, and `now - at ≥ nudgeMin · 60 000`, with
  `nudgeMin` and `channel` resolved at each tick from the project owning the run's folder (none: the app's). Gates are
  included: they reach the page through the same asks files. An entry with no `ts` is (re)tried when `now - triedAt ≥ 60 000`
  and a bot token exists; the console line is written only when the entry is created without a token. An open entry whose
  ask is gone is closed: run still `running`/`waiting` → `by: 'the terminal'`, else `by: null`. Closed entries older than 7
  days are dropped. Budget: per project with a cap, once per month each for `alert` and `cap` (`cap` posted alone when both
  cross in one tick); without a token, a console line, recorded the same.

- [ ] **Step 1: Failing tests** (fake Slack from Task 1; hand-made run folders with `host.json` `{ pid: process.pid, page: true }`,
  `state.json` `{ status: 'running' }` and an `asks/<id>.json`):
  - `an ask is posted once it has waited nudgeMin, once` (at 4 min: no call; at 5 min: one `chat.postMessage` to `#lamproom`
    with `unfurl_links: false`; next tick: none; store has `{ slackChannel: 'C1', ts }`);
  - `a project's nudgeMin, changed while waiting, applies` (override `nudgeMin: 10` → not posted at 5 min, posted at 10);
  - `without a token the ask is logged once and posted when a token appears` (one log line with the copy; second tick: none;
    after `saveSlackTokens` and 60 s: posted);
  - `a paused or ended run does not escalate` (dead pid → no post);
  - `Slack down or not_in_channel: recorded, retried a minute later, never thrown` (`chat.postMessage` → `not_in_channel`
    → `slackProblems(d, '#lamproom')` = `['Slack: #lamproom: the bot is not in the channel; invite it with /invite @Lamproom']`;
    a tick 30 s later: no call; 60 s: retried; success clears the problem; a closed port: no throw);
  - `Answer opens the modal; a submission writes the answer, repaints, and a second gets already answered`
    (`block_actions` → `views.open` with `trigger_id`; `view_submission` → answers file written as `answerAsk` writes it,
    `chat.update` with `Answered in Slack by alex`, returns `undefined` (modal closes); a second submission → returns
    `{ response_action: 'update', view: noticeModal('Already answered in Slack.') }`);
  - `a number that is not a number keeps the modal open` (→ `{ response_action: 'errors', errors: { q0: … } }`, no file);
  - `the page's answer repaints the message` (`noteAnswered(…, 'Lamproom')` → `chat.update` `Answered in Lamproom`; a late
    **Answer** click → `views.open` with `Already answered in Lamproom.`);
  - `a gone ask repaints: terminal while alive, no longer waiting once the run ended` (both cases, then no further calls);
  - `the budget is posted once at the alert and once at the cap` (spend 85% → one alert copy; again: none; 100% with
    `onLimit: 'ask'` → the ask copy with `http://localhost:3000/runs`; a new month → alert again);
  - in `flow-logs.test.ts`: `the first answer wins` (two `answerAsk` calls before the host reads → the second returns `'already answered'`, the file holds the first).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; every Slack call goes through `slackCall`, store updates are synchronous read-modify-writes
  (`writeJsonFile`) made after each awaited call, so the tick and an interaction never lose each other's writes.
- [ ] **Step 4:** Rerun the two files; expect PASS.
- [ ] **Step 5:** Commit `feat(escalation): post waiting questions to Slack, answer them there, repaint everywhere`.

### Task 5: The server keeps it running

**Files:**
- Modify: `packages/cli/src/escalation.ts` (`startEscalation`), `instrumentation.ts`, `app/api/runs/[run]/answer/route.ts`,
  `app/api/projects/route.ts` (append `slackProblems` of each project's resolved channel to its `problems`)
- Test: `packages/cli/test/escalation.test.ts`

**Interfaces:**
- Produces: `startEscalation(dataDir, runsDir, o?: { everyMs?: number; base?: string }): EscalationHost`,
  `EscalationHost = { refresh(): void; state(): SocketState | { state: 'off' } }`, kept on `globalThis.__fbEscalation`
  (a second call returns the first). `refresh()` closes the socket and reconnects with the saved tokens (none: `off`).
  `escalationHost(): EscalationHost | undefined` reads the global for routes.
- Consumes: `connectSocket` (Task 2), `escalationTick`, `onInteraction`, `noteAnswered` (Task 4).

- [ ] **Step 1: Failing test**: `startEscalation connects, handles an interaction end to end, and starts once` (tokens saved,
  fake Slack; `startEscalation(d, r, { everyMs: 50, base })` twice → same object, one socket; an ask past its time is posted;
  the fake sends a `view_submission` envelope through the socket → the answer file appears and `chat.update` is called;
  `removeSlack` + `refresh()` → `state()` is `off`).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; `instrumentation.ts` calls it beside `startScheduler`; the answer route calls
  `void noteAnswered(dataDir(), runsDir(), run, id, picked, 'Lamproom')` after a successful `answerAsk` (`answerAsk` now
  returns nothing on success, so the route passes the answers it validated).
- [ ] **Step 4:** Rerun; `pnpm typecheck:packages`; expect PASS.
- [ ] **Step 5:** Commit `feat(escalation): the Next server keeps Slack connected and checks every 15 seconds`.

### Task 6: The pages

**Files:**
- Create: `app/api/slack/route.ts`, `app/settings/slack.tsx`
- Modify: `packages/cli/src/settings.ts` (`AppSettings.address`, default `'http://localhost:3000'`, schema
  `^https?://[^\s/]+(/\S*)?$`, error `a web address, like http://localhost:3000`), `app/settings/settings.tsx`
  (`EscalationChannelsPage`: the Slack row is `SlackRow`, the rest stay *coming soon*), `app/projects/api.ts`,
  `app/projects/settings-pages.tsx` (escalation footnote), `packages/cli/test/settings.test.ts`

**Interfaces:**
- `GET /api/slack` → `SlackView = { bot: boolean; app: boolean; socket: SocketState | { state: 'off' }; problems: string[]; address: string }`;
  `PUT { bot?, app? }` saves (then `refresh()`); `DELETE` removes both (then `refresh()`); `POST` → `testSlack`. All behind `refused`.
- `slackQuery`, `saveSlackTokens`, `removeSlackTokens`, `testSlackTokens` in `app/projects/api.ts`.
- The Connections page: two password inputs (*Bot token*, *App-level token*), each showing only *set* or *not set*;
  **Save**, **Test** (workspace and bot name), **Remove**; a status line (*Connected to <team>* / *Connecting…* /
  *Not connected: <error>* / *Not connected: paste both tokens*); the problem lines; the *Lamproom address* field (saved
  as the app's `address`); a link to the setup note's manifest. The project escalation footnote becomes
  *Slack is connected: a question waiting this long is posted to the channel, and can be answered there.* or
  *Slack is not connected (Settings → Connections → Escalation channels): waiting questions are only logged.*

- [ ] **Step 1: Failing test** in `settings.test.ts`: `the Lamproom address is an app setting` (default; `updateAppSettings({ address: 'ftp://x' })` → 400 with the copy).
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement the setting, route, client functions, pages.
- [ ] **Step 4:** `pnpm typecheck:packages`, `npx tsc --noEmit -p .`, `pnpm test:app`; then a browser check on a dev server
  (scratch data and runs dirs, `SLACK_API_URL` at a fake Slack): paste tokens → *set*, **Test** → workspace name,
  *Connected*; a hand-made waiting ask is posted to the fake; a modal submission through the fake socket writes the answer
  and the fake sees `chat.update`; the project's escalation page says *Slack is connected*.
- [ ] **Step 5:** Commit `feat(settings): Slack is a real escalation channel, with its tokens, test and address`.

### Task 7: Docs

- [ ] Update `docs/Lamproom/Projects/Project Settings.md` (Escalation row), the *Status* sections of
  `Escalation And Notifications Overview.md` and `Slack Adapter.md` (and the Index if it says not built), `Projects Index.md`;
  write `docs/Lamproom/Projects/Slack Escalation Handoff.md` (how it works, the Slack app manifest and setup steps, what
  was checked, decisions open to review, rulings, known problems). Commit `docs(projects): Slack escalation is built`.

## Decisions open to Alex's review

| # | Decision | Why | Changing it |
|---|---|---|---|
| 1 | Anyone in the channel who can click may answer | Single-user app; Socket Mode only receives the app's own workspace | Check `payload.user.id` against a saved list of Slack user ids |
| 2 | Gates (verdict, escalation, run failed) escalate like agents' questions | They reach the page through the same asks files | Skip asks whose heading is empty |
| 3 | The server checks every 15 s; a question escalates up to 15 s late and a terminal answer repaints up to 15 s late | No queue, files only | A file watcher on the runs folder |
| 4 | An answer typed in the terminal repaints as *Answered in the terminal*, with no summary | The host deletes the ask and answer files and logs nothing Lamproom can read | Have lr-run-flow write its answers to the run's log |
| 5 | A post that failed is retried each minute while the question waits | A missing invite is fixed by hand, then it just works | Back off longer |
| 6 | Budget messages go to the project's escalation channel | One channel setting per project | A separate budget channel setting |
