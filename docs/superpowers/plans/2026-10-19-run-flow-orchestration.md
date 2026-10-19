# `run-flow`: Multi-Agent Flow Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm run-flow flow.yaml` runs a graph of agent and shell steps. Steps can fan out, join, loop back on failure, stop at human gates and resume after a crash. Each step runs on its own provider (Claude Code or OpenCode), through the agent providers already built.

**Architecture:**
- The engine is one pure function in `@flowboard/core`: `advance(flow, state, event) → { state, commands }`. It implements the designed PRD §8 rules, and a validator checks a flow before it runs.
- `@flowboard/cli` adds the first host, `run-flow`:
  - it reads a flow YAML that grows out of `run-agent`'s YAML;
  - it carries out the engine's commands (launch a provider run, run a shell check, ask a person);
  - it saves the state after every transition.
- `@flowboard/ask-user` gains `set_outcome`.
- `@flowboard/adapters` does not change.

**Tech Stack:** TypeScript on Node 24 type stripping, `node:test`, pnpm 10 workspaces, `yaml` 2.9, `zod` 4.6, `@modelcontextprotocol/sdk` (ask-user), `node:util` `parseArgs`.

**Spec:** `docs/FlowBoard/Multi-Agent Orchestration Analysis.md`. It is on `dev` and was untracked when this plan was written, so read it from the main checkout. This plan carries every decision an implementer needs; the analysis is the background.

## Before you start

- Create a worktree for a new branch `feature/flow-orchestration` from `dev`, using superpowers:using-git-worktrees. `feature/agent-providers` is merged into `dev` first (Alex, 2026-10-19).
  - Don't reuse an existing worktree: another session may own it. Check ListAgents first.
- Copy this plan into the new worktree's `docs/superpowers/plans/` and commit it.
- In `code/flowboard/`, run `pnpm install && pnpm test:packages && pnpm typecheck:packages`. Everything should pass before Task 1.

## Decisions this plan makes

The analysis left these open (its §7 and §8). Each line below is **my call**, not the owner's, unless it is marked **(Alex)**. Override any of them before Task 1 starts.

| Question | Call |
|---|---|
| **(Alex)** Where routes live | A top-level `edges:` list, as in yamlgraph, because the Flow Design canvas will read and write these files. An edge is `{ from, to, condition }`, the fields of a `step_edges` row; `condition` is `always` (the default), `on_pass` or `on_fail`. At most one edge goes from one step to another, so `from` and `to` identify it: the stable edge id the backlog asks for. There is no `START` or `END`, which `step_edges` could not store: the entry is the step no edge points to |
| Flow Design #24, #25: type keys or file names | Type keys, each saved as `<type>.md`. Names cannot contain a dot today, so accepting a file name such as `result.json` later breaks no flow |
| 7.1 The unfinished "but …" | Unknown. The plan assumes it changes nothing below |
| 7.2 Where flows live | Decide later. The engine takes a plain `FlowDef`. `run-flow` reads YAML and pins its loaded copy (`flow.json`) for the run, so `--resume` never re-reads the YAML |
| 7.3 CLI or worker first | CLI. The worker, queue and web app are out of scope |
| 7.4 Provider per step | Yes: `adapter` per step, with a flow-level `defaults`. There are no capability-gap warnings, because both providers declare the same capability set today |
| 7.5 Parallel steps, one folder | One folder. `write_roots` narrows a step's file edits, and `--max-runs 1` runs branches one at a time |
| 7.6 Routing beyond pass/fail | No |
| 7.7 How a step reports its outcome | The `set_outcome` tool; both providers have `mcp_tools`. `RunResult.outcome` is also read, because Replay sets it. No JSON fallback |
| Execution #4: is a rework target a join? | No. A step waits for each step with a *forward* route into it while that step is live or can still be reached from a live step. Rework routes never make a join |
| Execution #7: which outcome source wins | The `set_outcome` file, then `RunResult.outcome`, then none |
| Execution #9: what "earlier" means | An `on_fail` route to its own step, or to an ancestor along `always`/`on_pass` routes, is a **rework** route. Every other route is forward, and forward routes must not loop |
| Execution #17: which runs are wasted | On rework: every run so far of the target and of every step downstream of it, including the failing run. Also interrupted runs, infra-failed runs, and a run replaced by a gate Retry |
| Execution #18, Flow Design #20: downstream attempts | Reset. Downstream instances are recreated, and only the target's count carries |
| Execution #64: approve over the agent's `fail` | The person wins: approve sets `pass`, reject sets `fail` |
| Execution #5, #71: a silent approval step | Gated once. The approval gate's decision is the outcome |
| Execution #66: does `attempts` count the first run? | Yes, the first run sets 1. Escalate when `attempts + 1 > max_attempts` |
| Execution #14, #16: a spent loop | Escalate, never fail on its own (D3). Retry does not reset the count, so the next failure escalates at once |
| Execution #58, #67: stuck detection | A failing shell run whose fingerprint equals that step's previous *failed* run escalates (PRD wording), across instances |
| Execution #19: stripping digits | Keep the PRD algorithm, with one change: an absolute path shrinks to its file name rather than disappearing, so different failing files stay different |
| Execution #21: where a note goes | Into the next run's preamble |
| Execution #49, #50: one branch blocked, cancel | A gate on one branch doesn't stop the others. There is no cancel: Ctrl+C pauses (resumable), and "Fail the flow" at a gate stops every live run |
| Flow Design #19: join behind a conditional route | The join runs once nothing can still feed it, and `--check` warns about it |
| Flow Design #22: back-edges as ancestry | No. Rework inputs are implicit |
| Flow Design #23, Execution #65: entries and producers | Exactly one entry step (no route into it), and one producer per artifact type |
| Flow Design #37: budget and turn caps | Optional. `--check` warns when an `ai` step has neither |
| **(Alex)** New: a `fail` that fires no route | Waits at a `verdict` gate, `failed, and no edge handles a failure`, offering Approve, Retry this step and Fail the flow. Other branches keep running, as at every gate. With this, only a person's Fail the flow ever fails a flow (D3) |
| Reject with no `on_fail` route (PRD: "fails the task") | Not offered: a gate lists Reject only when its step has an `on_fail` route. Without one, Reject either repeated Fail the flow or, through an `always` route, carried the rejected work on to the next step |
| New: exit 0 without a declared output | The step waits at a gate with `did not write: …`. It is never a silent pass |
| New: infra failures | Not retried automatically. They wait at a gate: Retry keeps the attempt number, Fail ends the flow |
| **(Alex)** Uncommitted changes at start | Refused unless `--allow-dirty`: changed tracked files in `folder` exit 2 before anything is created. Untracked files don't count, or the flow's own new files would block every run. `--resume` never checks. Not a git repository: a warning |
| Where run state lives | `runs/` beside where the command runs, as for `run-agent`. When that is inside `folder`, ai steps' `guards.denyPaths` cover the run folder, and the host re-creates the folder before each state write, so a check running `git clean -fdx` cannot crash it |
| Two hosts in one folder | Refused, by `<folder>/.flowboard/lock`. A lock whose pid is dead is replaced, with a warning that its agents may still be running: the adapters expose no pids to stop them |
| A step that hangs | `timeout_minutes` per step. Shell steps default to 30; ai steps have none, since their `limits` bound them. A timeout is an infra failure, so it opens a `run_failed` gate |
| Secrets and shell steps | Variables named `*_KEY`, `*_TOKEN`, `*_SECRET` or `*_PASSWORD` are removed from shell steps' environment, and their names are printed at start. Agents keep the environment their provider needs; the sandbox is the real fix |
| A failing check that prints nothing | Gets no fingerprint, so it never counts as stuck |
| A missing input | The step still runs; the host says so, and the prompt names it |

## Left out

Each is small to add later, when its trigger arrives:

- the worker, queue and web app;
- parking and the 20-minute hold (the terminal answers live);
- automatic infra retry backoff;
- dynamic fan-out and worktrees;
- routing on labels;
- `declare_artifact`;
- a JSON outcome fallback;
- prompt `{{placeholders}}`;
- memory (part 7);
- a flow-wide budget ceiling (Flow Design #12);
- capability-gap warnings;
- a Mermaid overlay of a run's route;
- cancel;
- an `agent:` file key (use `system_prompt`);
- prompt-injection scanning of hand-offs between steps;
- stopping agents orphaned by `kill -9` (the adapters expose no pids, so the lock only warns);
- counting untracked files as uncommitted changes.

## Global Constraints

- **Code rules:**
  - erasable syntax only;
  - `import type` for types;
  - `.ts` relative imports;
  - tests with `node:test` and `node:assert/strict`;
  - commands run from `code/flowboard/`.
- **Core purity:** `packages/core` imports no framework, database driver, CLI or `@flowboard/adapters`. `validateFlow` and `advance` do no I/O. `@flowboard/adapters` is not changed.
- **No new dependencies.**
- **Relative paths** (the YAML or run-folder argument, `folder`, `task`, `prompt`, `plugins`, `skills`, `runs/`) resolve against the folder the command was run from, `process.env.INIT_CWD ?? process.cwd()` (R2). `write_roots` resolve against `folder`.
- **Names:** step names and artifact types match `/^[a-z0-9][a-z0-9_-]*$/`, because they become file names. Lowercase only: macOS treats `Plan.md` and `plan.md` as one file.
- **Error line format:** `<yaml path as typed>: <field>: <message>`, as in `run-agent`.
- **Exit codes:**
  - 0: the flow is done.
  - 1: the flow failed.
  - 2: bad usage, config or flow, uncommitted changes, or another run-flow in the folder; nothing launched.
  - 3: paused at a gate with no terminal to answer it.
  - 130: stopped by Ctrl+C.
- **Files:**
  - `runs/<stamp>-<flow name>/` holds `flow.json`, `state.json`, `flow.jsonl` (one line per engine transition), `<NNN>-<step>.jsonl` and `<NNN>-<step>.outcome.json`. `<NNN>` is the run id, zero-padded to 3; `<stamp>` is `run.ts`'s `stamp()`. A taken folder name gets `-2`, `-3`, ….
  - Artifacts go in `<folder>/.flowboard/<run folder name>/<type>.md`.
  - `<folder>/.flowboard/lock` exists while a host works in the folder.
  - `run-flow` never touches `.gitignore` (R14).
- **Env:**
  - `FLOWBOARD_OUTCOME_FILE` tells the shim where `set_outcome` writes `{"outcome":"pass"|"fail","reason"?:string}`.
  - `FLOWBOARD_ARTIFACTS` tells a shell step where the artifacts are.
- **Shell output:**
  - The last 20 000 characters go to the step's artifact.
  - The fingerprint uses the last 20 non-empty lines.
- **Fixed copy:**
  - `OUTCOME_CLOSING`: `Before you stop, report your verdict with the set_outcome tool: "pass" if the work meets the task, "fail" if it does not, with a one-line reason.`
  - Note line, appended to the preamble: `\n\nA person's note for this attempt: <note>`.
  - Missing-inputs line, appended to the preamble after the note: `\n\nMissing inputs (an earlier step did not write them): <types, comma-separated>`.
  - Gate reasons: `no outcome reported`; `approval needed` (plus `; the agent says <outcome>` and `: <reason>` when set); `failed, and no edge handles a failure` (with ` (<reason>)` after `failed` when set); `did not write: <types, comma-separated>`; `<target> has used <n> of <max> attempts`; `<step> failed the same way twice`; `run failed: <error>`.
  - Gate choices (value: label): `approve`: `Approve (pass)`; `reject`: `Reject (fail)`; `retry`: `Retry this step`; `fail`: `Fail the flow`.
  - Note question: `Note for the next attempt (optional)`.
- **Spending:**
  - Automated tests spend nothing.
  - Live tests run only under `FLOWBOARD_LIVE=1`.
  - OpenCode live runs use `openrouter/deepseek/deepseek-v4.1-flash`, which spends OpenRouter credit.
- **Simplifications:** where the code makes a deliberate simplification from *Left out*, mark it with a `ponytail:` comment that names the ceiling.

## Review Focus

1. **An edge written yamlgraph's way** (`to: [a, b]`, `condition: score < 0.8`, `from: START`) must fail at load with a line that says what to write instead. Tests in Task 5.
2. **A step or artifact name with path characters** (`../x`, `a/b`) must be refused at load, because names become file paths. Test in Task 5.
3. **Two parallel steps asking at once** must show one prompt at a time, each headed with its step's name. Event lines must not print over an open prompt. Test in Task 10.
4. **An agent that exits 0 without writing its declared output** must stop at a gate, never pass. This includes leaving last attempt's file untouched. Tests in Tasks 8 and 10.
5. **A check command that hangs** must stop promptly on Ctrl+C, and `--resume` must rerun it. Test in Task 11.

## Files

| File | Responsibility |
|---|---|
| `packages/core/src/flow/flow.ts` (new) | `FlowDef` types, graph helpers, `validateFlow` |
| `packages/core/src/flow/engine.ts` (new) | State, event and command types, `advance` |
| `packages/core/src/flow/fingerprint.ts` (new) | `fingerprint` |
| `packages/core/src/index.ts` | Re-export the three |
| `packages/ask-user/src/server.ts`, `main.ts` | `set_outcome` |
| `packages/cli/src/config.ts` | Split into `readYaml` and `configFromObject`; export the schema and helpers |
| `packages/cli/src/run.ts` | Extract `streamRun` and `summaryLines`; export helpers; `withAsking` takes extra env |
| `packages/cli/src/flow-config.ts` (new) | `loadFlow`, `toMermaid` |
| `packages/cli/src/flow-exec.ts` (new) | `execShell`, `execAi`: one step run, then a `RunEnd`; `shellEnv` |
| `packages/cli/src/flow-run.ts` (new) | `runFlow`: arguments, the uncommitted-changes check, the lock, the transition loop, terminal, gates, state, resume |
| `packages/cli/src/flow-main.ts` (new) | Entry point |
| `package.json` | Scripts `run-flow` and `test:live` |
| `docs/FlowBoard/Agent Providers/Run Flow Reference.md` (new) | User reference |

---

### Task 1: Flow model and validator

**Files:**
- Create: `packages/core/src/flow/flow.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './flow/flow.ts';`)
- Test: `packages/core/test/flow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Outcome = 'pass' | 'fail';
  export type EdgeCondition = 'always' | 'on_pass' | 'on_fail';
  export interface FlowEdge { from: string; to: string; condition: EdgeCondition }
  export interface StepDef { id: string; requires: string[]; produces: string[]; approval: boolean; maxAttempts: number }
  export interface FlowDef { steps: StepDef[]; edges: FlowEdge[] }
  export const DEFAULT_MAX_ATTEMPTS = 3;
  /** `edge` is an index into `flow.edges`. */
  export interface FlowProblem { step?: string; edge?: number; message: string; warning?: true }
  /** An on_fail route to its own step or to an ancestor along always/on_pass routes. */
  export function isRework(flow: FlowDef, edge: FlowEdge): boolean;
  /** Steps reachable from `id` along non-rework routes; `id` itself excluded. */
  export function downstream(flow: FlowDef, id: string): Set<string>;
  export function validateFlow(flow: FlowDef): FlowProblem[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downstream, isRework, validateFlow } from '../src/flow/flow.ts';
import type { EdgeCondition, FlowDef, FlowEdge, StepDef } from '../src/flow/flow.ts';

const step = (id: string, o: Partial<StepDef> = {}): StepDef => ({ id, requires: [], produces: [], approval: false, maxAttempts: 3, ...o });
const e = (from: string, to: string, condition: EdgeCondition = 'always'): FlowEdge => ({ from, to, condition });
const flow = (steps: (string | StepDef)[], edges: FlowEdge[]): FlowDef => ({ steps: steps.map((s) => (typeof s === 'string' ? step(s) : s)), edges });

const delivery = flow(
  [step('plan', { produces: ['plan'] }), step('implement', { requires: ['plan'], produces: ['notes'] }), step('check', { produces: ['check_output'] }), step('review', { requires: ['notes', 'check_output'], produces: ['review'] })],
  [e('plan', 'implement'), e('implement', 'check'), e('check', 'review', 'on_pass'), e('check', 'implement', 'on_fail'), e('review', 'implement', 'on_fail')],
);

test('a sound flow has no problems', () => assert.deepEqual(validateFlow(delivery), []));

test('rework routes go back to the step itself or an ancestor', () => {
  assert.equal(isRework(delivery, e('check', 'implement', 'on_fail')), true);
  assert.equal(isRework(delivery, e('check', 'check', 'on_fail')), true);
  assert.equal(isRework(delivery, e('check', 'review', 'on_pass')), false);
  assert.equal(isRework(delivery, e('plan', 'review', 'on_fail')), false);
});

test('downstream follows routes but not rework routes', () => {
  assert.deepEqual([...downstream(delivery, 'implement')].sort(), ['check', 'review']);
  assert.deepEqual([...downstream(delivery, 'review')], []);
});

test('structural problems', () => {
  assert.deepEqual(validateFlow(flow(['a'], [e('a', 'nope')])), [{ edge: 0, message: 'unknown step "nope"' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [e('a', 'b'), e('a', 'b', 'on_fail')])), [{ edge: 1, message: 'repeats the edge a → b; keep one and set its condition' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [])), [{ message: 'more than one entry step: a, b' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [e('a', 'b'), e('b', 'a')])), [
    { message: 'no entry step: every step has a route into it' },
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['s', 'a', 'b', 'c'], [e('s', 'a'), e('a', 'b'), e('b', 'a'), e('b', 'c')])), [
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['a', 'b', 'c', 'd'], [e('a', 'b'), e('c', 'd'), e('d', 'c', 'on_fail')])), [
    { step: 'c', message: 'no route leads here from the entry step "a"' },
    { step: 'd', message: 'no route leads here from the entry step "a"' },
  ]);
});

test('artifact problems: one producer per type, inputs from forward ancestors only', () => {
  const dup = structuredClone(delivery);
  dup.steps[3].produces = ['review', 'notes'];
  assert.deepEqual(validateFlow(dup), [{ step: 'review', message: 'produces "notes", which "implement" also produces' }]);
  const back = structuredClone(delivery);
  back.steps[1].requires = ['plan', 'review']; // review reaches implement only through a rework route
  assert.deepEqual(validateFlow(back), [{ step: 'implement', message: 'requires "review", and no step before it produces that' }]);
});

test('a join behind a conditional route is a warning', () => {
  assert.deepEqual(validateFlow(flow(['a', 'c', 'd'], [e('a', 'd', 'on_pass'), e('a', 'c'), e('c', 'd')])), [
    { step: 'd', warning: true, message: 'waits for "a", whose route here is conditional; if it does not fire, d runs without it' },
  ]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/core/test/flow.test.ts`
Expected: FAIL, cannot find module `../src/flow/flow.ts`.

- [ ] **Step 3: Implement `flow.ts`**

Checks run in this order, so the messages come out in the order the tests expect:
1. Edges that name an unknown step, or repeat an earlier edge's `from` and `to`. Return if there are any.
2. Entry count: zero or more than one is a problem. Continue either way.
3. Forward loops. Return if there are any.
4. Unreachable steps (only when there is exactly one entry).
5. Duplicate producers.
6. Unmet `requires`.
7. Warnings.

How each check works:
- **Rework routes:** ancestry for `isRework` uses only `always` and `on_pass` routes.
- **Forward routes:** every route that is not rework.
- **Loops:** peel steps with no remaining forward routes in, then do the same on the reversed graph. Report the steps left after both passes, in step order.
- **Reachability:** from the entry, along every route.
- **Ancestry for `requires`:** forward routes only.
- **The join warning:** for each step with two or more forward routes in, warn about each of those routes that is not `always`.

Recompute the graph on every call, with a `ponytail:` comment that flows have a handful of steps.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/core/test/flow.test.ts && pnpm typecheck:packages`
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/flow/flow.ts packages/core/src/index.ts packages/core/test/flow.test.ts
git commit -m "feat(core): flow model and validator"
```

---

### Task 2: Engine: routes, joins, gates and decisions

**Files:**
- Create: `packages/core/src/flow/engine.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './flow/engine.ts';`)
- Test: `packages/core/test/engine.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `isRework` and `downstream`.
- Produces:
  ```ts
  export type InstanceState = 'pending' | 'running' | 'awaiting_approval' | 'done' | 'failed';
  export type GateKind = 'verdict' | 'escalation' | 'run_failed';
  export type Decision = 'approve' | 'reject' | 'retry' | 'fail';
  export interface Gate { kind: GateKind; reason: string; evidence: string[]; decisions: Decision[]; from?: string } // `from`: escalation only
  export interface StepInstance { state: InstanceState; attempts: number; outcome?: Outcome; gate?: Gate; inputs: string[]; note?: string }
  export interface RunRecord { id: number; step: string; attempt: number; live: boolean; costUsd: number; wasted: boolean; outcome?: Outcome; reason?: string; error?: string; fingerprint?: string }
  export interface FlowState { status: 'running' | 'done' | 'failed'; steps: Record<string, StepInstance>; runs: RunRecord[] }
  export interface RunEnd { costUsd: number; outcome?: Outcome; reason?: string; error?: string; missing?: string[]; fingerprint?: string }
  export type FlowEvent =
    | { type: 'start' }
    | ({ type: 'run_ended'; run: number; interrupted?: boolean } & RunEnd)
    | { type: 'decide'; step: string; decision: Decision; note?: string }
    | { type: 'resume' };
  export type FlowCommand =
    | { type: 'run'; run: number; step: string; attempt: number; inputs: string[]; note?: string }
    | { type: 'gate'; step: string; gate: Gate }
    | { type: 'stop'; runs: number[] }
    | { type: 'end'; status: 'done' | 'failed' };
  export type RunCommand = Extract<FlowCommand, { type: 'run' }>;
  export const GATE_DECISIONS: Record<GateKind, Decision[]>;
  export function newFlowState(): FlowState; // { status: 'running', steps: {}, runs: [] }
  export function advance(flow: FlowDef, state: FlowState, event: FlowEvent): { state: FlowState; commands: FlowCommand[] };
  ```

- [ ] **Step 1: Write the failing tests**

Test helpers (top of `engine.test.ts`; `step`, `e` and `flow` as in Task 1):

```ts
type End = { end: string; outcome?: Outcome; reason?: string; error?: string; missing?: string[]; fp?: string; cost?: number; interrupted?: boolean };
type Ev = End | Exclude<FlowEvent, { type: 'start' | 'run_ended' }>;
const text = (c: FlowCommand) =>
  c.type === 'run' ? `run:${c.step}:${c.attempt}` : c.type === 'gate' ? `gate:${c.step}:${c.gate.kind}` : c.type === 'stop' ? `stop:${c.runs.join(',')}` : `end:${c.status}`;

/** Starts the flow, then feeds `events`; `{ end: s }` ends s's live run. `log` has one entry per event (start first): its commands as text, space-separated. */
function play(f: FlowDef, events: Ev[]) {
  let state = newFlowState();
  const commands: FlowCommand[] = [];
  const log: string[] = [];
  const all: (Ev | FlowEvent)[] = [{ type: 'start' }, ...events];
  for (const ev of all) {
    let event: FlowEvent;
    if ('end' in ev) {
      const run = state.runs.findLast((r) => r.step === ev.end && r.live);
      assert.ok(run, `no live run of ${ev.end}`);
      event = { type: 'run_ended', run: run.id, costUsd: ev.cost ?? 0, outcome: ev.outcome, reason: ev.reason, error: ev.error, missing: ev.missing, fingerprint: ev.fp, interrupted: ev.interrupted };
    } else event = ev;
    const r = advance(f, state, event);
    state = r.state;
    commands.push(...r.commands);
    log.push(r.commands.map(text).join(' '));
  }
  return { state, commands, log };
}
```

Tests:

```ts
test('a linear flow runs each step once, then ends done', () => {
  assert.deepEqual(play(flow(['a', 'b'], [e('a', 'b')]), [{ end: 'a' }, { end: 'b' }]).log, ['run:a:1', 'run:b:1', 'end:done']);
});

test('fan-out starts both branches; the join waits for both', () => {
  const f = flow(['a', 'b', 'c', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b' }, { end: 'c' }, { end: 'd' }]).log, ['run:a:1', 'run:b:1 run:c:1', '', 'run:d:1', 'end:done']);
});

test('a join waits for a branch that has not reached it yet', () => {
  const f = flow(['a', 'b', 'c', 'x', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'x'), e('x', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b' }, { end: 'c' }, { end: 'x' }, { end: 'd' }]).log,
    ['run:a:1', 'run:b:1 run:c:1', '', 'run:x:1', 'run:d:1', 'end:done']);
});

test('the outcome picks the route', () => {
  const f = flow(['a', 'p', 'q'], [e('a', 'p', 'on_pass'), e('a', 'q', 'on_fail')]);
  assert.equal(play(f, [{ end: 'a', outcome: 'pass' }]).log[1], 'run:p:1');
  assert.equal(play(f, [{ end: 'a', outcome: 'fail' }]).log[1], 'run:q:1');
});

test('no outcome on a conditional step waits for a verdict; approve takes the pass route', () => {
  const f = flow(['a', 'p', 'q'], [e('a', 'p', 'on_pass'), e('a', 'q', 'on_fail')]);
  const { log, state } = play(f, [{ end: 'a' }, { type: 'decide', step: 'a', decision: 'approve' }]);
  assert.deepEqual(log.slice(1), ['gate:a:verdict', 'run:p:1']);
  assert.equal(play(f, [{ end: 'a' }]).state.steps.a.gate?.reason, 'no outcome reported');
  assert.equal(state.steps.a.outcome, 'pass');
});

test("an approval step waits even with an outcome, and approve wins over the agent's fail", () => {
  const f = flow([step('a', { approval: true, produces: ['plan'] }), 'p'], [e('a', 'p', 'on_pass')]);
  const first = play(f, [{ end: 'a', outcome: 'fail', reason: 'unsure' }]);
  assert.deepEqual(first.state.steps.a.gate, { kind: 'verdict', reason: 'approval needed; the agent says fail: unsure', evidence: ['plan'], decisions: ['approve', 'retry', 'fail'] });
  assert.equal(play(f, [{ end: 'a', outcome: 'fail' }, { type: 'decide', step: 'a', decision: 'approve' }]).log.at(-1), 'run:p:1');
});

test('reject is offered only with an on_fail route; fail stops every live run', () => {
  const f = flow(['a', step('b', { approval: true }), 'c'], [e('a', 'b'), e('a', 'c')]);
  const gated = play(f, [{ end: 'a' }, { end: 'b' }]).state;
  assert.deepEqual(gated.steps.b.gate?.decisions, ['approve', 'retry', 'fail']);
  assert.deepEqual(advance(f, gated, { type: 'decide', step: 'b', decision: 'reject' }), { state: gated, commands: [] });
  const { log, state } = play(f, [{ end: 'a' }, { end: 'b' }, { type: 'decide', step: 'b', decision: 'fail' }]);
  assert.deepEqual(log.slice(1), ['run:b:1 run:c:1', 'gate:b:verdict', 'stop:3 end:failed']);
  assert.deepEqual([state.status, state.steps.c.state, state.runs[2].live], ['failed', 'failed', false]);
});

test('a fail that fires no route waits at a gate; a pass that fires none ends its branch', () => {
  const f = flow([step('a', { produces: ['out'] }), 'p'], [e('a', 'p', 'on_pass')]);
  const failed: Ev[] = [{ end: 'a', outcome: 'fail', reason: 'two tests fail' }];
  assert.deepEqual(play(f, failed).state.steps.a.gate,
    { kind: 'verdict', reason: 'failed (two tests fail), and no edge handles a failure', evidence: ['out'], decisions: ['approve', 'retry', 'fail'] });
  assert.equal(play(f, [...failed, { type: 'decide', step: 'a', decision: 'approve' }]).log.at(-1), 'run:p:1');
  assert.equal(play(flow(['a', 'q'], [e('a', 'q', 'on_fail')]), [{ end: 'a', outcome: 'pass' }]).log[1], 'end:done');
});

test('a run that did not write its outputs waits for a verdict', () => {
  const f = flow([step('a', { produces: ['plan', 'notes'] }), 'b'], [e('a', 'b')]);
  assert.equal(play(f, [{ end: 'a', missing: ['plan', 'notes'] }]).state.steps.a.gate?.reason, 'did not write: plan, notes');
});

test('an infra failure waits at a run_failed gate; retry reruns the same attempt', () => {
  const f = flow(['a'], []);
  const { log, state } = play(f, [{ end: 'a', error: 'boom', cost: 0.2 }, { type: 'decide', step: 'a', decision: 'retry' }]);
  assert.deepEqual(log.slice(1), ['gate:a:run_failed', 'run:a:1']);
  assert.deepEqual([state.runs[0].wasted, state.runs[0].costUsd], [true, 0.2]);
  assert.equal(play(f, [{ end: 'a', error: 'boom' }]).state.steps.a.gate?.reason, 'run failed: boom');
});

test('retry at a verdict gate starts the next attempt with the note and wastes the run it replaces', () => {
  const { commands, state } = play(flow([step('a', { approval: true })], []), [{ end: 'a' }, { type: 'decide', step: 'a', decision: 'retry', note: 'shorter' }]);
  assert.deepEqual(commands.at(-1), { type: 'run', run: 2, step: 'a', attempt: 2, inputs: [], note: 'shorter' });
  assert.equal(state.runs[0].wasted, true);
});

test('a decision the gate does not offer, or for a step not at a gate, changes nothing', () => {
  const f = flow(['a', 'b'], [e('a', 'b')]);
  const before = play(f, [{ end: 'a', error: 'boom' }]).state;
  for (const ev of [{ type: 'decide', step: 'a', decision: 'approve' }, { type: 'decide', step: 'b', decision: 'retry' }] as FlowEvent[]) {
    assert.deepEqual(advance(f, before, ev), { state: before, commands: [] });
  }
  assert.deepEqual(GATE_DECISIONS, { verdict: ['approve', 'reject', 'retry', 'fail'], escalation: ['retry', 'fail'], run_failed: ['retry', 'fail'] });
});

test('a join whose conditional route did not fire runs once nothing can still feed it', () => {
  const f = flow(['a', 'b', 'c', 'x', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd', 'on_pass'), e('b', 'x', 'on_fail'), e('c', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b', outcome: 'fail' }, { end: 'c' }, { end: 'x' }, { end: 'd' }]).log,
    ['run:a:1', 'run:b:1 run:c:1', 'run:x:1', 'run:d:1', '', 'end:done']);
});

test('advance does not change the state it is given', () => {
  const f = flow(['a', 'b'], [e('a', 'b')]);
  const s = play(f, []).state;
  const copy = structuredClone(s);
  advance(f, s, { type: 'run_ended', run: 1, costUsd: 0 });
  assert.deepEqual(s, copy);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/core/test/engine.test.ts`
Expected: FAIL, cannot find module `../src/flow/engine.ts`.

- [ ] **Step 3: Implement `advance` in `packages/core/src/flow/engine.ts`**

Rules. The flow is assumed valid, so add a `ponytail:` comment that `validateFlow` ran first.

- **Purity:** work on `structuredClone(state)`. Optional fields of commands and gates are left out, not set to `undefined`. `GATE_DECISIONS` is the object the test pins.
- **Order of events:** `start` only acts on a fresh state. Once the status is not `running`, only `run_ended` acts, and only to record a stopped run's `costUsd`.
- **Starting a run of step `s` (attempt `n`, `inputs`, `note`):**
  - the run id is `runs.length + 1`;
  - push `{ id, step, attempt: n, live: true, costUsd: 0, wasted: false }`;
  - the instance becomes `running`, with `attempts = n`, `inputs` and `note` set, and `gate` and `outcome` cleared;
  - emit `run`.
- **First run of a step:** attempt 1, with `inputs = requires`. `start` begins the entry step (the step no route points to).
- **`run_ended` for run `r`:**
  1. If `r` is no longer live, set its `costUsd` and stop.
  2. Copy `costUsd`, `outcome`, `reason`, `error` and `fingerprint` into the record, and set `live = false`.
  3. Then, first match wins:
     - `interrupted`: set `wasted` and `error = 'interrupted'`; the instance stays `running`; emit nothing.
     - `error`: set `wasted`; open a `run_failed` gate with `run failed: <error>` and evidence `[]`.
     - `missing` is not empty: open a `verdict` gate with `did not write: …` and evidence `[]`.
     - the step has `approval`: open a `verdict` gate with the approval reason and evidence = the step's `produces`.
     - otherwise: **complete** the step with its outcome.
  4. For the `missing` and `approval` cases, keep the agent's outcome on the instance.
- **Complete step `s` with an outcome (and optional note):**
  - If `s` has an `on_pass` or `on_fail` route and there is no outcome, open a `verdict` gate with `no outcome reported` and evidence = `produces`.
  - If the outcome is `fail` and `s` has no `always` or `on_fail` route, open a `verdict` gate with the unhandled-failure reason from Global Constraints (using the latest run's `reason`) and evidence = `produces`. The instance keeps its outcome.
  - Otherwise `s` becomes `done`, and its `always` routes fire, plus the route matching the outcome.
  - Each forward route that fires creates a `pending` instance for its target, unless one exists. Rework routes come in Task 3.
- **Opening a gate:** the instance becomes `awaiting_approval` with `gate` set, and a `gate` command is emitted. `gate.decisions` is `GATE_DECISIONS[kind]`, minus `reject` when the step has no `on_fail` route.
- **`decide`:** acts only when the step is `awaiting_approval` and `gate.decisions` includes the decision.
  - `approve`: complete the step with `pass`.
  - `reject`: complete it with `fail`, carrying the note.
  - `fail`: fail the flow.
  - `retry` at a `run_failed` gate: start the same attempt with the same inputs and the new note.
  - `retry` at a `verdict` gate: first set `wasted` on the step's latest run, then start `attempts + 1`, past `maxAttempts` if need be.
- **Fail the flow:**
  - every live run gets `live = false` and `error = 'stopped'` (not wasted), and their ids go in one `stop` command;
  - every `pending`, `running` or `awaiting_approval` instance becomes `failed`;
  - the status becomes `failed`, and `end` `failed` is emitted.
- **Settle,** after every event while the status is `running`:

```ts
const live = ids whose state is pending | running | awaiting_approval;
for (const j of flow step order) if (steps[j]?.state === 'pending') {
  const others = live.filter((x) => x !== j);
  const blocking = new Set([...others, ...others.flatMap((x) => [...downstream(flow, x)])]);
  const upstream = forward routes into j → their `from`;
  if (!upstream.some((u) => blocking.has(u))) start j at attempt 1 with inputs = requires;
}
if (no instance is pending, running or awaiting_approval) { status = 'done'; emit end done }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/core/test/engine.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/flow/engine.ts packages/core/src/index.ts packages/core/test/engine.test.ts
git commit -m "feat(core): flow engine: routes, joins, gates and decisions"
```

---

### Task 3: Engine: rework, attempts, escalation and resume

**Files:**
- Modify: `packages/core/src/flow/engine.ts`
- Test: `packages/core/test/engine.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 as it stands.
- Produces: no new exports. Rework routes, escalation gates, `retry` at escalation gates and `resume` start working.

- [ ] **Step 1: Write the failing tests**

```ts
// plan → impl → check; check on_pass → review; check and review on_fail → impl
const loop = (max = 3) => flow(
  ['plan', step('impl', { requires: ['plan'], produces: ['notes'], maxAttempts: max }), step('check', { produces: ['check_output'] }), step('review', { produces: ['review'] })],
  [e('plan', 'impl'), e('impl', 'check'), e('check', 'review', 'on_pass'), e('check', 'impl', 'on_fail'), e('review', 'impl', 'on_fail')],
);
const SPENT: Ev[] = [
  { end: 'plan' }, { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'A' },
  { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' },
  { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' },
];

test('a failed check reworks its target with the raw failing output and wastes the superseded runs', () => {
  const { log, commands, state } = play(loop(), SPENT.slice(0, 3));
  assert.equal(log.at(-1), 'run:impl:2');
  assert.deepEqual(commands.at(-1), { type: 'run', run: 4, step: 'impl', attempt: 2, inputs: ['plan', 'check_output'] });
  assert.deepEqual(state.runs.map((r) => r.wasted), [false, true, true, false]);
  assert.equal(state.steps.check, undefined);
});

test('check and review share the target\'s attempts; a spent loop escalates and starts nothing', () => {
  const { log, state } = play(loop(), SPENT);
  assert.deepEqual(log.slice(3), ['run:impl:2', 'run:check:1', 'run:review:1', 'run:impl:3', 'run:check:1', 'run:review:1', 'gate:impl:escalation']);
  assert.deepEqual(state.steps.impl.gate, { kind: 'escalation', reason: 'impl has used 3 of 3 attempts', evidence: ['review'], decisions: ['retry', 'fail'], from: 'review' });
});

test('a check failing like its previous failure escalates with attempts left, even across a pass', () => {
  const twice = play(loop(5), [...SPENT.slice(0, 3), { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'A' }]);
  assert.equal(twice.log.at(-1), 'gate:impl:escalation');
  assert.equal(twice.state.steps.impl.gate?.reason, 'check failed the same way twice');
  assert.equal(play(loop(5), [...SPENT.slice(0, 3), { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'B' }]).log.at(-1), 'run:impl:3');
  assert.equal(play(loop(5), [...SPENT.slice(0, 7), { end: 'check', outcome: 'fail', fp: 'A' }]).log.at(-1), 'gate:impl:escalation');
});

test('retry at an escalation grants one more attempt with the note; the next failure escalates at once', () => {
  const { commands, log } = play(loop(), [...SPENT, { type: 'decide', step: 'impl', decision: 'retry', note: 'use the cache' }, { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' }]);
  assert.deepEqual(commands.find((c) => c.type === 'run' && c.attempt === 4), { type: 'run', run: 10, step: 'impl', attempt: 4, inputs: ['plan', 'review'], note: 'use the cache' });
  assert.equal(log.at(-1), 'gate:impl:escalation');
  assert.equal(play(loop(), [...SPENT, { type: 'decide', step: 'impl', decision: 'fail' }]).log.at(-1), 'end:failed');
});

test("a reject's note goes to the rework target", () => {
  const f = flow(['impl', step('review', { approval: true, produces: ['review'] })], [e('impl', 'review'), e('review', 'impl', 'on_fail')]);
  const { commands } = play(f, [{ end: 'impl' }, { end: 'review' }, { type: 'decide', step: 'review', decision: 'reject', note: 'add tests' }]);
  assert.deepEqual(commands.at(-1), { type: 'run', run: 3, step: 'impl', attempt: 2, inputs: ['review'], note: 'add tests' });
});

test('a rework stops a downstream run that is still going and wastes it', () => {
  const f = flow(['impl', step('check', { produces: ['out'] }), 'lint'], [e('impl', 'check'), e('impl', 'lint'), e('check', 'impl', 'on_fail')]);
  const { log, state } = play(f, [{ end: 'impl' }, { end: 'check', outcome: 'fail' }]);
  assert.deepEqual(log.slice(1), ['run:check:1 run:lint:1', 'stop:3 run:impl:2']);
  assert.deepEqual([state.runs[2].live, state.runs[2].wasted], [false, true]);
  assert.equal(state.steps.lint, undefined);
});

test('a step may rework itself; a repair step reached only by rework starts at attempt 1', () => {
  const self = flow(['s', step('a', { maxAttempts: 2 })], [e('s', 'a'), e('a', 'a', 'on_fail')]);
  assert.deepEqual(play(self, [{ end: 's' }, { end: 'a', outcome: 'fail' }, { end: 'a', outcome: 'fail' }]).log, ['run:s:1', 'run:a:1', 'run:a:2', 'gate:a:escalation']);
  const repair = flow(['impl', step('check', { produces: ['out'] }), 'fix'], [e('impl', 'check'), e('check', 'fix', 'on_fail'), e('fix', 'check')]);
  assert.deepEqual(play(repair, [{ end: 'impl' }, { end: 'check', outcome: 'fail' }, { end: 'fix' }]).log, ['run:impl:1', 'run:check:1', 'run:fix:1', 'run:check:1']);
});

test('an interrupted run keeps its step running; resume restarts it at the same attempt and re-asks open gates', () => {
  const f = flow(['a', 'b', step('c', { approval: true })], [e('a', 'b'), e('a', 'c')]);
  const { state } = play(f, [{ end: 'a' }, { end: 'c' }, { end: 'b', interrupted: true, cost: 0.3 }]);
  assert.equal(state.steps.b.state, 'running');
  assert.deepEqual([state.runs[1].live, state.runs[1].wasted, state.runs[1].costUsd], [false, true, 0.3]);
  assert.deepEqual(advance(f, state, { type: 'resume' }).commands.map(text), ['run:b:1', 'gate:c:verdict']);
});

test('resume after a crash wastes runs that never ended', () => {
  const f = flow(['a'], []);
  const r = advance(f, play(f, []).state, { type: 'resume' });
  assert.deepEqual(r.commands.map(text), ['run:a:1']);
  assert.deepEqual([r.state.runs[0].live, r.state.runs[0].wasted, r.state.runs[0].error], [false, true, 'interrupted']);
});

test('a stopped run reporting late only updates its cost', () => {
  const f = flow(['a', step('b', { approval: true }), 'c'], [e('a', 'b'), e('a', 'c')]);
  const { state } = play(f, [{ end: 'a' }, { end: 'b' }, { type: 'decide', step: 'b', decision: 'fail' }]);
  const r = advance(f, state, { type: 'run_ended', run: 3, costUsd: 0.7, outcome: 'pass' });
  assert.deepEqual([r.commands, r.state.runs[2].costUsd, r.state.runs[2].outcome], [[], 0.7, undefined]);
});
```

- [ ] **Step 2: Run the tests to see the new ones fail**

Run: `node --test packages/core/test/engine.test.ts`
Expected: the Task 2 tests pass; the new ones fail.

- [ ] **Step 3: Implement rework, escalation and resume**

Rework fires when a fired route `s → t` is a rework route. The order of checks matters:

```ts
const used = steps[t]?.attempts ?? 0;
const last = latest run of s;
const prev = latest earlier run of s with outcome 'fail' and a fingerprint;
if (used + 1 > def(t).maxAttempts) escalate(t, s, `${t} has used ${used} of ${def(t).maxAttempts} attempts`);
else if (last.fingerprint && prev?.fingerprint === last.fingerprint) escalate(t, s, `${s} failed the same way twice`);
else redo(t, s, used + 1, note);
```

- **`escalate(t, s, reason)`:** open an `escalation` gate on `t`, with evidence = `s`'s `produces` and `from: s`. Start nothing.
- **`redo(t, s, attempt, note)`:**
  1. For `t` and every step in `downstream(flow, t)`: every run gets `wasted = true`. A live run also gets `live = false` and `error = 'superseded'`, and its id is collected.
  2. Every downstream instance other than `t` is deleted.
  3. Emit one `stop` for the collected ids, if any.
  4. Then start `t` at `attempt`, with inputs = `requires` followed by `s`'s `produces` (no duplicates) and the note.
- **`retry` at an escalation gate on `t`:** `redo(t, gate.from, attempts + 1, note)`, with no `maxAttempts` check.
- **`resume`:**
  1. Every live run gets `live = false`, `wasted = true` and `error = 'interrupted'`.
  2. Then, in step order: each `running` instance starts a new run at its current `attempts`, with its stored inputs and note.
  3. Each `awaiting_approval` instance re-emits its `gate`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/core/test/engine.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/flow/engine.ts packages/core/test/engine.test.ts
git commit -m "feat(core): rework loops, shared attempts, escalation and resume"
```

---

### Task 4: `run-agent` config checks usable from a parsed mapping

**Files:**
- Modify: `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts` (append)

**Interfaces:**
- Produces (exports; `loadConfig`'s behaviour is unchanged):
  ```ts
  export const RunSchema; // the current `Schema`, renamed
  export function issueLines(issue: $ZodIssue, raw: unknown): string[];
  export function toAbs(p: string, baseDir: string): string;
  export const isDir: (p: string) => boolean;
  export const isFile: (p: string) => boolean;
  /** File, syntax and root-shape checks; error lines carry `yamlPath` as typed. */
  export function readYaml(yamlPath: string, baseDir: string): { ok: true; abs: string; raw: Record<string, unknown> } | { ok: false; errors: string[] };
  /** Every schema, file and semantic check of one run's settings; error lines are `field: message`. */
  export function configFromObject(raw: Record<string, unknown>, baseDir: string): { ok: true; config: Omit<RunConfig, 'yamlPath'> } | { ok: false; errors: string[] };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test('configFromObject checks a parsed mapping the way loadConfig checks a file', () => {
  const base = project(MINIMAL);
  const fromFile = loadConfig('task.yaml', base);
  const fromObject = configFromObject({ adapter: 'claude-code', model: 'sonnet', folder: 'proj', prompt: 'task.md' }, base);
  assert.ok(fromFile.ok && fromObject.ok);
  assert.deepEqual(fromObject.config.spec, fromFile.config.spec);
  assert.deepEqual(configFromObject({ adapter: 'claude-code', folder: 'proj', prompt: 'task.md' }, base), { ok: false, errors: ['model: required'] });
});

test('readYaml reports file problems with the path as typed', () => {
  const base = project(MINIMAL);
  assert.deepEqual(readYaml('nope.yaml', base), { ok: false, errors: ['nope.yaml: file: not found'] });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/config.test.ts`
Expected: FAIL, `configFromObject` is not exported.

- [ ] **Step 3: Split `loadConfig`**

- `readYaml` takes lines 108–118 of today's `loadConfig`.
- `configFromObject` takes the rest, without the `${yamlPath}: ` prefix.
- `loadConfig` becomes `readYaml`, then `configFromObject`, then prefixes the error lines and adds `yamlPath`.

- [ ] **Step 4: Run the whole CLI suite**

Run: `node --test packages/cli/test/*.test.ts && pnpm typecheck:packages`
Expected: all pass. That includes every existing `run-agent` test, unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/test/config.test.ts
git commit -m "refactor(cli): run config checks usable from a parsed mapping"
```

---

### Task 5: The flow file, `--check` and `--mermaid`

**Files:**
- Create: `packages/cli/src/flow-config.ts`, `packages/cli/src/flow-run.ts`, `packages/cli/src/flow-main.ts`
- Modify: `package.json` (script `"run-flow": "node packages/cli/src/flow-main.ts"`)
- Test: `packages/cli/test/flow-config.test.ts`, `packages/cli/test/flow-run.test.ts`

**Interfaces:**
- Consumes: Task 1 (`validateFlow`, `isRework`, `DEFAULT_MAX_ATTEMPTS`) and Task 4's exports. `CLOSING`, `RunConfig` and `RunDeps` already exist.
- Produces:
  ```ts
  export const OUTCOME_CLOSING: string; // Global Constraints
  export interface AiStep { kind: 'ai'; run: RunConfig; timeoutMinutes?: number }
  export interface ShellStep { kind: 'shell'; command: string; timeoutMinutes: number } // default 30
  export interface FlowConfig { yamlPath: string; name: string; folder: string; flow: FlowDef; steps: Record<string, AiStep | ShellStep>; warnings: string[] }
  export type FlowLoadResult = { ok: true; config: FlowConfig } | { ok: false; errors: string[] };
  export function loadFlow(yamlPath: string, baseDir: string): FlowLoadResult;
  export function toMermaid(flow: FlowDef): string;
  // flow-run.ts
  export async function runFlow(args: string[], deps: RunDeps): Promise<number>;
  ```

**The flow file:**

- **Flow-level keys:**
  - `folder` (required);
  - `task` (required: a file whose text is every step's preamble);
  - `defaults` (optional: any `run-agent` key except `folder`);
  - `steps` (required: a non-empty mapping of name to step);
  - `edges` (optional, default `[]`: a list of strict `{ from, to, condition }` objects; `from` and `to` are step names, and `condition` is `always` (the default), `on_pass` or `on_fail`).
- **Step keys:**
  - every `run-agent` key except `folder`;
  - `prompt` (the step's own prompt file, which becomes `spec.prompt.template`);
  - `requires` and `produces` (lists of artifact types, default `[]`);
  - `gate: approval`;
  - `max_attempts` (a whole number of 1 or more, default 3);
  - `shell` (a command, which makes the step a shell step);
  - `write_roots` (paths inside `folder`);
  - `timeout_minutes` (a number above 0: a longer run is stopped; shell steps default to 30, ai steps have none).
- **Schema:** the step schema is `RunSchema.omit({ folder: true }).partial().extend({ … })`. zod 4.6 keeps it strict, so unknown keys still fail.
- **Merging defaults:** a step's keys replace `defaults` keys whole (a shallow merge).
- **Name and edge order:** the flow's name is the YAML file name without its extension; there is no `name` key. `flow.edges` keeps the order the edges are written in.
- **Each `ai` step's `RunConfig`:**
  - `configFromObject({ ...merged launch keys, folder, prompt: task }, baseDir)`, with error lines re-prefixed `steps.<name>.`;
  - `spec.prompt.template` is the step's prompt text;
  - `spec.prompt.closing` is `` `${CLOSING} ${OUTCOME_CLOSING}` `` when an `on_pass` or `on_fail` edge leaves the step;
  - `spec.guards.writeRoots` is the resolved `write_roots`, when set.
- **Shell steps** ignore `defaults`. A launch key set on the step itself is an error.

Errors, in this order. After any `(root)` or schema error, no other checks run; bad names and `START`/`END` count as schema errors. The per-step run checks (the last row) run only when `folder` and `task` passed:

| Line after `<yaml>: ` | When |
|---|---|
| `steps.<name>: name may only use lowercase letters, digits, - and _` | Bad step name |
| `steps.<name>.produces.<i>: name may only use lowercase letters, digits, - and _` | Bad artifact type in `produces`; the same for `requires` |
| `edges.<i>.to: one step name; write one edge per pair of steps` | `to` is a list; the same for `from` |
| `edges.<i>.condition: must be always, on_pass or on_fail` | Anything else, such as a yamlgraph expression |
| `edges.<i>.from: no START or END here; a flow starts at the step no edge points to and ends when nothing is left to run` | yamlgraph's pseudo-steps, as `from` or `to` |
| `folder: not a directory: <abs>`, `task: not a file: <abs>`, `task: file is empty` | Flow-level files |
| `edges.<i>: …`, `steps.<name>: …` or `steps: …` from `validateFlow` (warnings excluded) | Graph problems, by the problem's `edge`, its `step`, or neither |
| `steps.<name>.prompt: not a file: <abs>`, `steps.<name>.prompt: file is empty` | Step prompt |
| `steps.<name>: an ai step needs prompt, skill or system_prompt` | Nothing to do |
| `steps.<name>.<key>: not used by a shell step` | Launch key on a shell step |
| `steps.<name>.produces: a shell step writes one artifact` | More than one |
| `steps.<name>.write_roots.<i>: must be inside folder` | Path escapes |
| `steps.<name>.<field>: …` from `configFromObject` | Per-step run checks |

Warnings (`FlowConfig.warnings`, no file prefix):
- `validateFlow`'s warnings, as `steps.<name>: <message>`;
- `steps.<name>: no limits.max_turns or limits.budget_usd; nothing stops a looping agent`, for an `ai` step with neither after the merge.

**The `--check` and `--mermaid` commands:**
- **Usage** (stderr, exit 2):
  ```
  usage: pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>
         pnpm run-flow --resume <run folder> [--max-runs <n>]
  ```
- **Without `--check`, `--mermaid` or `--resume`:** this task prints `run-flow: running flows comes in Task 9` and exits 2. Task 9 replaces it.
- **`--check`:** prints warnings as `-- warning: <line>`, then `-- flow ok: <n> steps`, and exits 0. Errors go to stderr, with exit 2.
- **`--mermaid`:** prints `toMermaid(flow)` and exits 0.

- [ ] **Step 1: Write the failing tests**

The helper `flowProject(yaml, extra = {})` makes a temp base holding:
- `proj/`;
- `task.md` (`Build it.`);
- `prompts/<name>.md` for `plan implement tests review x a c d`, each holding its own name;
- `flow.yaml` and any `extra` files.

```ts
const DELIVERY = `
folder: proj
task: task.md
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  plan: { prompt: prompts/plan.md, produces: [plan], gate: approval }
  implement: { prompt: prompts/implement.md, requires: [plan], produces: [notes] }
  tests:
    adapter: opencode
    model: openrouter/deepseek/deepseek-v4.1-flash
    prompt: prompts/tests.md
    requires: [plan]
    produces: [test_notes]
    write_roots: [tests]
  check: { shell: pnpm test, produces: [check_output] }
  review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], max_attempts: 2 }
edges:
  - { from: plan, to: implement }
  - { from: plan, to: tests }
  - { from: implement, to: check }
  - { from: tests, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail }
  - { from: review, to: implement, condition: on_fail }
`;

test('a flow file becomes a FlowDef plus one launch config per ai step', () => {
  const base = flowProject(DELIVERY);
  const r = loadFlow('flow.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  const { flow, steps, name, folder, warnings } = r.config;
  assert.deepEqual([name, folder, warnings], ['flow', join(base, 'proj'), []]);
  assert.deepEqual(flow.steps.map((s) => [s.id, s.approval, s.maxAttempts]), [['plan', true, 3], ['implement', false, 3], ['tests', false, 3], ['check', false, 3], ['review', false, 2]]);
  assert.deepEqual(flow.edges, [
    { from: 'plan', to: 'implement', condition: 'always' }, { from: 'plan', to: 'tests', condition: 'always' },
    { from: 'implement', to: 'check', condition: 'always' }, { from: 'tests', to: 'check', condition: 'always' },
    { from: 'check', to: 'review', condition: 'on_pass' }, { from: 'check', to: 'implement', condition: 'on_fail' },
    { from: 'review', to: 'implement', condition: 'on_fail' },
  ]); // an edge without `condition` is `always`
  assert.deepEqual(steps.check, { kind: 'shell', command: 'pnpm test', timeoutMinutes: 30 });
  const tests = steps.tests.kind === 'ai' ? steps.tests.run : assert.fail();
  assert.equal(tests.adapter, 'opencode');
  assert.deepEqual(tests.spec.guards?.writeRoots, [join(base, 'proj', 'tests')]);
  assert.deepEqual([tests.spec.prompt.preamble, tests.spec.prompt.template, tests.spec.prompt.closing], ['Build it.', 'tests', CLOSING]);
  const review = steps.review.kind === 'ai' ? steps.review.run : assert.fail();
  assert.equal(review.spec.prompt.closing, `${CLOSING} ${OUTCOME_CLOSING}`);
  assert.deepEqual(review.spec.limits, { maxTurns: 30 });
});
```

Error tests. Each builds a flow from `DELIVERY` with one change and asserts `r.errors` includes the line (`deepEqual` where it is the only line):
- an unknown step key `promt` gives `flow.yaml: steps.plan.promt: unknown key`;
- a step named `../evil` gives `flow.yaml: steps.../evil: name may only use lowercase letters, digits, - and _`;
- a step named `Plan` gives `flow.yaml: steps.Plan: name may only use lowercase letters, digits, - and _`;
- `produces: [a/b]` on plan gives `flow.yaml: steps.plan.produces.0: name may only use lowercase letters, digits, - and _`;
- review requires `summary` gives `flow.yaml: steps.review: requires "summary", and no step before it produces that`;
- tests with `model: deepseek` gives `flow.yaml: steps.tests.model: opencode model must be "providerID/modelID"`;
- check with `model: sonnet` gives `flow.yaml: steps.check.model: not used by a shell step`;
- a step `x: {}` with the edge `{ from: review, to: x, condition: on_pass }` gives `flow.yaml: steps.x: an ai step needs prompt, skill or system_prompt`;
- `write_roots: [../out]` gives `flow.yaml: steps.tests.write_roots.0: must be inside folder`;
- the first edge as `{ from: plan, to: [implement, tests] }` gives `flow.yaml: edges.0.to: one step name; write one edge per pair of steps`;
- `condition: critique.score < 0.8` on the fifth edge gives `flow.yaml: edges.4.condition: must be always, on_pass or on_fail`;
- an extra edge `{ from: START, to: plan }` gives `flow.yaml: edges.7.from: no START or END here; a flow starts at the step no edge points to and ends when nothing is left to run`;
- an extra edge `{ from: check, to: review }` gives `flow.yaml: edges.7: repeats the edge check → review; keep one and set its condition`;
- an extra edge `{ from: review, to: nope }` gives `flow.yaml: edges.7: unknown step "nope"`;
- `folder: nope` gives `flow.yaml: folder: not a directory: <base>/nope`.

Warning tests:
- `defaults.limits` removed gives `steps.plan: no limits.max_turns or limits.budget_usd; nothing stops a looping agent` (one such line per ai step).
- A step `d` with an `on_pass` edge from `a` and an `always` edge from `c` gives the `validateFlow` join warning.

`toMermaid` test:

```ts
test('toMermaid draws steps, routes and rework loops', () => {
  const f: FlowDef = {
    steps: [{ id: 'plan', requires: [], produces: [], approval: true, maxAttempts: 3 }, ...['check', 'fix', 'ship'].map((id) => ({ id, requires: [], produces: [], approval: false, maxAttempts: 3 }))],
    edges: [{ from: 'plan', to: 'check', condition: 'always' }, { from: 'check', to: 'ship', condition: 'on_pass' }, { from: 'check', to: 'fix', condition: 'on_fail' }, { from: 'fix', to: 'check', condition: 'always' }],
  };
  assert.equal(toMermaid(f), ['flowchart LR', '  n0["plan (approval)"]', '  n1["check"]', '  n2["fix"]', '  n3["ship"]', '  n0 --> n1', '  n1 -->|pass| n3', '  n1 -.->|fail ↺| n2', '  n2 --> n1'].join('\n'));
});
```

A forward `on_fail` route draws as `-->|fail|`.

In `flow-run.test.ts`, use a `setup` helper like `run.test.ts`'s (temp base, captured `out`/`err`, a fixed `now`):
- `--check flow.yaml` exits 0 and prints `-- flow ok: 5 steps`.
- A bad flow exits 2, with the error lines on stderr and no `runs/` folder.
- `--mermaid flow.yaml` exits 0, and `out[0]` is `flowchart LR`.
- No arguments exits 2 with the usage lines.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/flow-config.test.ts packages/cli/test/flow-run.test.ts`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement `loadFlow`, `toMermaid`, `runFlow` (check and mermaid only) and `flow-main.ts`**

- `flow-main.ts` mirrors `main.ts`: `process.exitCode = await runFlow(process.argv.slice(2), { cwd: process.env.INIT_CWD ?? process.cwd() })`.
- Parse arguments with `node:util` `parseArgs`. The options are `check`, `mermaid`, `resume`, `max-runs` and `allow-dirty`, with `allowPositionals: true`. Each of these is a usage error:
  - an unknown option;
  - more than one of `--check`, `--mermaid` and `--resume`;
  - `--allow-dirty` with `--check`, `--mermaid` or `--resume`;
  - a flow path given with `--resume`, or no flow path without it.
- Check names with an explicit loop after the schema passes, not with a record-key regex: zod's message there is "Invalid key in record".

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/cli/test/*.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/flow-config.ts packages/cli/src/flow-run.ts packages/cli/src/flow-main.ts packages/cli/test/flow-config.test.ts packages/cli/test/flow-run.test.ts package.json
git commit -m "feat(cli): flow YAML with run-flow --check and --mermaid"
```

---

### Task 6: `set_outcome` on the ask-user server

**Files:**
- Modify: `packages/ask-user/src/server.ts`, `packages/ask-user/src/main.ts`
- Test: `packages/ask-user/test/shim.test.ts`

**Interfaces:**
- Produces:
  - `createAskServer(socketPath: string, outcomeFile?: string): McpServer`, which registers `set_outcome` only when `outcomeFile` is set.
  - `main.ts` passes `process.env.FLOWBOARD_OUTCOME_FILE`.
  - The file holds `{"outcome":"pass"|"fail","reason"?:string}`. A later call replaces it.

- [ ] **Step 1: Write the failing tests**

Change the `shim()` helper to `shim(socketPath, env: Record<string, string> = {})`, merging `env` into the child's environment.

```ts
test('set_outcome is offered only with FLOWBOARD_OUTCOME_FILE, and writes the verdict', async (t) => {
  const broker = await fakeBroker({ answers: {} });
  const file = join(mkdtempSync(join(tmpdir(), 'fb-out-')), 'outcome.json');
  const client = await shim(broker.socketPath, { FLOWBOARD_OUTCOME_FILE: file });
  t.after(async () => { await client.close(); await broker.close(); });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ['ask_user', 'ask_user_batch', 'set_outcome']);
  const res = await call(client, 'set_outcome', { outcome: 'fail', reason: 'two tests fail' });
  assert.deepEqual([res.isError, res.content[0].text], [undefined, 'Recorded: fail']);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { outcome: 'fail', reason: 'two tests fail' });
});

test('set_outcome refuses anything but pass or fail, and writes nothing', async (t) => {
  // same setup; call { outcome: 'maybe' }
  // assert res.isError === true; res.content[0].text === 'outcome must be "pass" or "fail"'; existsSync(file) === false
});
```

The existing `lists ask_user and ask_user_batch` test stays as it is.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/ask-user/test/shim.test.ts`
Expected: the two new tests fail.

- [ ] **Step 3: Implement `set_outcome`**

- **Description:** `Report whether this step's work passed or failed; the flow follows the matching route. Call it once before you stop; a later call replaces an earlier one.`
- **Input schema:** stays lenient, like `ask_user`: `{ outcome: z.string(), reason: z.string().optional() }`.
- **Handler:**
  - trim and lowercase `outcome`, then check it in the handler; anything else is the tool error `outcome must be "pass" or "fail"`;
  - write the file with `writeFileSync`;
  - a write error is a tool error carrying its message.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/ask-user/test/shim.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ask-user/src packages/ask-user/test/shim.test.ts
git commit -m "feat(ask-user): set_outcome writes the step's verdict for the flow host"
```

---

### Task 7: Shell steps and fingerprints

**Files:**
- Create: `packages/core/src/flow/fingerprint.ts`, `packages/cli/src/flow-exec.ts`
- Modify: `packages/core/src/index.ts`; `packages/cli/src/run.ts` (add `export` to `openLog`, nothing else)
- Test: `packages/core/test/fingerprint.test.ts`, `packages/cli/test/flow-exec.test.ts`

**Interfaces:**
- Consumes: `RunCommand` and `RunEnd` (Task 2); `openLog` from `run.ts`.
- Produces:
  ```ts
  // core
  /** sha256 hex of the last 20 non-empty lines, normalised in this order: absolute paths cut to their last segment, hex ids (7+ hex characters including a digit) removed, digits removed. */
  export function fingerprint(output: string): string;
  // cli/flow-exec.ts
  export const OUTPUT_TAIL = 20_000;
  export interface StepRun { ended: Promise<RunEnd>; stop(): void } // `ended` never rejects
  export interface ExecContext {
    artifactsDir: string; logDir: string;
    show(line: string): void; now(): Date;
    makeProvider(adapter: Adapter): AgentProvider; answer: Answerer; onInterrupt(): void; // ai steps (Task 8)
  }
  export function artifactPath(artifactsDir: string, type: string): string; // `${artifactsDir}/${type}.md`
  export function execShell(command: string, folder: string, run: RunCommand, produces: string[], ctx: ExecContext): StepRun;
  /** `env` without names ending in _KEY, _TOKEN, _SECRET or _PASSWORD (any case); `removed` lists them, sorted. */
  export function shellEnv(env: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; removed: string[] };
  ```

- [ ] **Step 1: Write the failing tests**

`fingerprint.test.ts`:

```ts
test('noise does not change the fingerprint', () => {
  assert.equal(fingerprint('FAIL rotates token (12ms)\nat /Users/a/p/src/t.ts:3:5'), fingerprint('FAIL rotates token (340ms)\nat /home/ci/x/src/t.ts:9:1'));
  assert.equal(fingerprint('commit a3f9c2e1 broke it'), fingerprint('commit 77be01d9 broke it'));
  assert.equal(fingerprint('2026-10-19T10:00:00Z boom'), fingerprint('2026-11-02T23:59:59Z boom'));
  assert.equal(fingerprint(['changed', ...Array(20).fill('same')].join('\n')), fingerprint(['other', ...Array(20).fill('same')].join('\n')));
});
test('a different failure changes it', () => {
  assert.notEqual(fingerprint('FAIL rotates token\nFAIL revokes old token'), fingerprint('FAIL revokes old token'));
  assert.notEqual(fingerprint('at /p/src/a.ts'), fingerprint('at /p/src/b.ts'));
  assert.match(fingerprint('x'), /^[0-9a-f]{64}$/);
});
```

`flow-exec.test.ts` (shell part). It runs real `sh` for $0. Each test makes temp `folder`, `artifactsDir` and `logDir`, plus a run command `{ type: 'run', run: 7, step: 'check', attempt: 1, inputs: [] }`:
- `exit 0` with output gives `{ costUsd: 0, outcome: 'pass' }` and no fingerprint. `check_output.md` holds the output.
- `echo boom; exit 1` gives outcome `fail`, with `fingerprint === fingerprint('boom\n')`.
- `exit 1` with no output gives outcome `fail` and no fingerprint, so a quiet check never counts as stuck.
- Output longer than `OUTPUT_TAIL` leaves exactly the last `OUTPUT_TAIL` characters in the artifact.
- `echo "$FLOWBOARD_ARTIFACTS"` writes `artifactsDir` into the artifact.
- With `process.env.FAKE_TOKEN = 'x'`, `echo "${FAKE_TOKEN:-gone}"` writes `gone`, and `shellEnv(process.env).removed` includes `FAKE_TOKEN`.
- `stop()` on `test -n x && sleep 30`, where sleep is a child of `sh`, ends within 2 s with `{ costUsd: 0, error: 'stopped' }`.
- `logDir/007-check.jsonl` has a `start` line (holding the command) and a `result` line (holding `exitCode` and `outcome`).

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/core/test/fingerprint.test.ts packages/cli/test/flow-exec.test.ts`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement `fingerprint` and `execShell`**

- **Spawning:** `spawn('sh', ['-c', command], { cwd: folder, env: { ...shellEnv(process.env).env, FLOWBOARD_ARTIFACTS: artifactsDir }, detached: true, stdio: 'pipe' })` from `node:child_process`, so the command and its children form one process group. Add a `ponytail:` comment: this bypasses `ExecHost`, which cannot kill a process group; go through it once the sandbox tier can. End the child's stdin at once. Collect stdout and stderr in arrival order, keeping the last `OUTPUT_TAIL` characters.
- **On close:**
  - write the tail to `produces[0]`'s artifact, if there is one;
  - exit 0 is `pass`, anything else is `fail`;
  - `fingerprint` the tail on `fail`, unless the tail is blank.
- **Errors:** a spawn `error` ends with `{ costUsd: 0, error: message }`.
- **Stopping:** `stop()` sends SIGTERM to the process group (`process.kill(-pid, 'SIGTERM')`), then SIGKILL if it has not closed 2 s later, and ends with `error: 'stopped'`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/core/test/fingerprint.test.ts packages/cli/test/flow-exec.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/flow/fingerprint.ts packages/core/src/index.ts packages/core/test/fingerprint.test.ts packages/cli/src/run.ts packages/cli/src/flow-exec.ts packages/cli/test/flow-exec.test.ts
git commit -m "feat: shell steps write check_output and fingerprint failures"
```

---

### Task 8: Agent steps

**Files:**
- Modify: `packages/cli/src/run.ts`, `packages/cli/src/flow-exec.ts`
- Test: `packages/cli/test/flow-exec.test.ts` (append); `packages/cli/test/run.test.ts` must still pass unchanged

**Interfaces:**
- Consumes: Task 7's `ExecContext`, `StepRun` and `artifactPath`; `startBroker`; `RunConfig`.
- Produces:
  ```ts
  // run.ts
  export type Log = (kind: string, body: object) => void;
  /** Launches and streams one run: each event is logged and shown; a launch or stream failure becomes a result with `error`. */
  export async function streamRun(launch: () => AgentRun, log: Log, show: (line: string) => void): Promise<{ result: RunResult; failedTools: number; last?: string }>;
  /** `-- N tool call(s) failed` and `-- last message: …`, each only when there is something to say. */
  export function summaryLines(failedTools: number, last?: string): string[];
  export function withAsking(config: RunConfig, socket: string, tmp: string, env?: Record<string, string>): RunSpec; // `env` joins the flowboard tool server's env
  export { stamp, defaultProvider, WITHDRAWN }; // now exported (openLog since Task 7)
  // flow-exec.ts
  export function execAi(config: RunConfig, run: RunCommand, produces: string[], ctx: ExecContext): StepRun;
  ```

- [ ] **Step 1: Write the failing tests**

Use a fake provider that records the spec it gets. Its run can:
- write files (`spec.prompt.outputs`);
- write the outcome file (`spec.tools` → `flowboard` → `env.FLOWBOARD_OUTCOME_FILE`);
- set `result.outcome`, `result.error` or `exitCode`;
- cost $0.10.

The tests:
- **The launched spec:**
  - `prompt.inputs` lists only input types whose artifact exists, with absolute `artifactPath` paths;
  - an input whose artifact does not exist is shown as `-- plan: missing input notes; it runs without it`, and the preamble ends with the missing-inputs line naming `notes` (after the note line, when there is one);
  - `prompt.outputs` lists `produces`;
  - with `note: 'shorter'`, the preamble ends `\n\nA person's note for this attempt: shorter`;
  - `guards.writeRoots` ends with `artifactsDir`;
  - the `flowboard` tool's env has both `FLOWBOARD_ASK_SOCKET` and `FLOWBOARD_OUTCOME_FILE` (`<logDir>/007-plan.outcome.json`).
- **Outcome:**
  - the outcome file `{"outcome":"fail","reason":"r"}` beats `result.outcome: 'pass'` and gives `outcome: 'fail', reason: 'r'`;
  - with no file, `result.outcome` is used;
  - with neither, the outcome is undefined.
- **Missing outputs** (Review Focus 4):
  - an output that was not written gives `missing: ['plan']`;
  - so does an output file that existed before the run with an old mtime (`utimesSync` to 2020) and was not rewritten.
- **Errors:**
  - `result.error: 'boom'` gives `error: 'boom'`;
  - `exitCode: 3` without an error gives `error: 'exit code 3'`;
  - an event stream that throws gives `error: <its message>`;
  - `costUsd` is 0.1.
- **Stopping:** `stop()` before the provider is launched ends with `error: 'stopped'`, and the provider is never launched.
- **The log:** `logDir/007-plan.jsonl` has `start`, `event` and `result` lines.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/flow-exec.test.ts`
Expected: the new tests fail.

- [ ] **Step 3: Extract `streamRun` and `summaryLines` from `runAgent`, then implement `execAi`**

- **The extraction:**
  - `runAgent` calls `streamRun(() => (run = provider.launch(spec)), log, show)`, so Ctrl+C still reaches `run`.
  - Its output lines and log lines stay byte-for-byte the same.
- **`execAi`, in order:**
  1. Open `openLog(logDir, '<NNN>-<step>')`, and make `tmp = realpathSync(mkdtempSync('/tmp/fb-'))` (the socket path limit).
  2. Start the broker. `ctx.answer` answers questions; the events log `question`, `answer` and `withdrawn`; a withdrawal also shows `WITHDRAWN`; interrupts go to `ctx.onInterrupt`.
  3. Build the spec: `withAsking(config, sock, tmp, { FLOWBOARD_OUTCOME_FILE })`, then set the prompt inputs, outputs, note and missing-inputs line, and the write roots. Show each missing input.
  4. Log `start` with `{ step, attempt, config: spec }`, and note the start time.
  5. Call `streamRun`, then close the broker. Log `result`, and show `summaryLines`.
  6. Settle `ended`. A setup failure is `error: 'cannot set up the run: <message>'`.
  7. Finally, close the log and remove `tmp`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/cli/test/*.test.ts && pnpm typecheck:packages`
Expected: all pass, including every `run.test.ts` test.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run.ts packages/cli/src/flow-exec.ts packages/cli/test/flow-exec.test.ts
git commit -m "feat(cli): agent steps read set_outcome and check their declared outputs"
```

---

### Task 9: `run-flow` runs a flow

**Files:**
- Modify: `packages/cli/src/flow-run.ts`
- Test: `packages/cli/test/flow-run.test.ts` (append)

**Interfaces:**
- Consumes: `advance` and `newFlowState` (Tasks 2–3); `loadFlow` (Task 5); `execShell`, `execAi` and `shellEnv` (Tasks 7–8); `stamp` and `noTerminal`.
- Produces: `runFlow` runs flows. It exits 0 when done, 1 when failed, and 3 when paused at a gate. Nothing answers a gate yet: Task 10 adds the terminal. Task 11 reuses `stopAll()` (rule 10).

How the host behaves:

1. **Setup**, in this order. Each refusal exits 2 before anything is created.
   - Load the flow. Print each warning as `-- warning: <line>`.
   - **Uncommitted changes:** unless `--allow-dirty`, run `git status --porcelain --untracked-files=no -- .` in `folder`. Any output refuses with `<yaml>: folder: uncommitted changes in <n> file(s); commit or stash them first, or pass --allow-dirty`. If git fails (not a repository, or no git), print `-- warning: <folder> is not in a git repository; nothing can undo the flow's edits` instead. Add a `ponytail:` comment: untracked files don't count, because the flow's own new files (`flow.yaml`, `runs/`, `.flowboard/`) usually are untracked.
   - **The lock:** choose the run folder's name, then create `<folder>/.flowboard/lock` exclusively (`openSync(path, 'wx')`), holding `{ pid, runDir }`. If it exists and its pid is alive (`process.kill(pid, 0)` does not throw), refuse with `<yaml>: folder: another run-flow (pid <pid>) is working here on <runDir>; if it is not, delete <lock path>`. If its pid is dead, replace the lock and print `-- warning: a run-flow (pid <pid>) ended without cleaning up; check that none of its agents are still running`. The host removes the lock when it finishes, however it finishes.
   - Make the run folder and the artifacts folder. A failure is `<yaml>: runs: cannot create the run folder: <message>`, with exit 2.
   - Write `flow.json`: `{ version: 1, config, artifactsDir }`.
   - When the run folder is inside `folder`, add `<run folder relative to folder>/**` to every ai step's `guards.denyPaths`.
   - Print `-- flow <name>: <n> steps in <folder>`, then `-- run folder <run folder relative to cwd>`. Print `-- warning: <step>: unrestricted shell: commands can write outside <folder>` for each step that opted in. If the flow has a shell step and `shellEnv(process.env).removed` is not empty, print `-- shell steps run without: <names, comma-separated>`.
2. **Every engine transition:**
   - `advance`;
   - append `{ at, event, commands }` to `flow.jsonl` in the run folder, with `at` from `deps.now()` in ISO form;
   - re-create the run folder if it has gone, then write `state.json` (Task 11 makes the write atomic);
   - carry out the commands in order.
3. **`run`:**
   - Queue it, and launch while fewer than `--max-runs` are live. There is no limit by default; anything but a whole number above 0 is a usage error, `--max-runs: must be a whole number above 0`.
   - On launch, print `-- <step> attempt <n> (<adapter> <model>)`, or `(shell)` for a shell step.
   - When the step's `timeoutMinutes` pass, stop the run. It ends with `error: 'timed out after <n> minutes'`, which opens a `run_failed` gate.
   - When it ends, print `-- <step> attempt <n>: <outcome | no outcome | failed: <error>>, $<cost to 2 places>`, then feed `run_ended`.
4. **`gate`:** print `-- <step> needs a decision`, and remember that the step is waiting.
5. **`stop`:** stop those live runs, and drop them if still queued.
6. **`end`:** wait until the live runs settle and their late costs are fed, then finish.
7. **Agent questions** get `noTerminal`.
8. **Paused:** when nothing is live or queued and a gate waits unanswered, finish paused.
9. **Finish:**
   - Print `-- flow <done|failed|paused>: <runs> runs, $<spent> spent, $<wasted> wasted`.
   - When paused, also print `-- waiting for a decision: <steps>` and `-- continue with: pnpm run-flow --resume <run folder>`.
10. **A host error:** write one `stopAll()` that stops launching, stops every live run, and feeds each one's end with `interrupted: true`. An exception anywhere in the loop calls it, saves the state, prints the `--resume` hint and rethrows, so Node prints the error and exits 1.

- [ ] **Step 1: Write the failing tests**

The helper `scripted(plays: Record<string, Play[]>)` returns `{ makeProvider, timeline, maxLive }`.
- **Plays:** `Play = 'pass' | 'fail' | 'none' | 'no-output' | 'error' | 'hang' | 'ask'`. The n-th run of step S plays `plays[S][n]`; S is read from `spec.prompt.template`, which is the step name in these flows.
- **What each play does:**
  - `pass` and `fail` write the outputs (each holding the step's name) and the outcome file;
  - `none` writes the outputs only;
  - `no-output` writes nothing, with outcome `pass`;
  - `error` ends with `{ exitCode: 1, error: 'boom' }`;
  - `hang` ends only when stopped;
  - `ask` asks `COLOUR` over the broker socket, then passes.
- **Records:** every run costs $0.10. `timeline` records `start:<S>` and `end:<S>`; `maxLive` is the most runs live at once.

Fixtures share the head `folder: proj`, `task: task.md`, `defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }`, and prompts `prompts/<S>.md` holding `S`. An arrow is an `always` edge.

- **Linear:** `plan → build → check`, where check is `shell: test -s "$FLOWBOARD_ARTIFACTS/notes.md"` with `produces: [check_output]`.
  - Expect exit 0 and `state.json` status `done`.
  - The logs `001-plan.jsonl`, `002-build.jsonl` and `003-check.jsonl` exist. `flow.jsonl` has one line per transition, and the first holds the `start` event.
  - `proj/.flowboard/2026-10-18T09-05-07-flow/plan.md` exists, and `proj/.flowboard/lock` does not.
  - The not-a-repository warning is printed. With `process.env.FAKE_TOKEN` set, so is a `-- shell steps run without:` line naming `FAKE_TOKEN`.
  - The output ends with `-- flow done: 3 runs, $0.20 spent, $0.00 wasted`.
- **Fan-out and join:** `plan → [a, b] → join`.
  - `start:join` comes after `end:a` and `end:b`, and `maxLive === 2`.
  - With `['--max-runs', '1', 'flow.yaml']`, `maxLive === 1`.
- **Rework:** `build → check`, where check is `shell: 'test -f done.flag || { touch done.flag; echo "FAIL first"; exit 1; }'` with an `on_fail` edge to build.
  - Expect exit 0, and build's second spec has a `prompt.inputs` entry of type `check_output`.
  - The output ends with `-- flow done: 4 runs, $0.20 spent, $0.10 wasted`.
- **Rework stops a sibling:** `build → [check, lint]`. Check is the failing-once shell from *Rework*, with an `on_fail` edge to build. Lint plays `['hang', 'pass']`.
  - Lint's first run is stopped, and its record is `wasted` in `state.json`; exit 0.
- **An unanswered gate:** an `on_pass` edge goes from `review` to `ship`, and review plays `none`.
  - Expect exit 3, printing `-- review needs a decision`, `-- flow paused:`, `-- waiting for a decision: review` and the `--resume` hint.
- **Timeout:** a one-step flow, where check is `shell: sleep 30` with `timeout_minutes: 0.005`.
  - Within 2 s, `-- check attempt 1: failed: timed out after 0.005 minutes, $0.00` is printed.
  - Expect exit 3, at a `run_failed` gate.
- **Uncommitted changes:** `proj` is a git repository with one committed file, which is then changed.
  - Expect exit 2 with `flow.yaml: folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty`, and no `runs/` folder.
  - With `--allow-dirty`, the flow runs; exit 0.
  - With the change committed and one new untracked file, the flow runs; exit 0.
- **The lock:**
  - A lock holding this process's pid exits 2 with the `another run-flow` line.
  - A lock holding a dead pid (a finished `true` child's) is replaced with the warning, and the flow runs; exit 0.
- **Host error:** `plan → [a, b]`, where a plays `hang` and b plays `pass`. When b's run ends, arm `deps.now` to throw `disk full` once.
  - `runFlow` rejects with `disk full`.
  - a's run was stopped, and it is `wasted` in `state.json`.
  - The lock is gone.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/flow-run.test.ts`
Expected: the new tests fail; the Task 5 tests pass.

- [ ] **Step 3: Implement the host in `flow-run.ts`**

Use the rules above.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/cli/test/*.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/flow-run.ts packages/cli/test/flow-run.test.ts
git commit -m "feat(cli): run-flow runs flows: fan-out, joins, rework, timeouts and a folder lock"
```

---

### Task 10: Gates and the terminal

**Files:**
- Modify: `packages/cli/src/flow-run.ts`
- Test: `packages/cli/test/flow-run.test.ts` (append)

**Interfaces:**
- Consumes: Task 9; `terminalAnswerer`.
- Produces: gates and agents' questions are answered in the terminal, one prompt at a time. With no terminal, Task 9's behaviour stands.

Rules:

1. **`gate`**, with a terminal: after `-- <step> needs a decision`, ask two questions:
   - `{ id: 'decision', kind: 'single_select', prompt: '<step>: <reason>', help: 'See: <evidence paths that exist, comma-separated>' (only when there are any), options }`, where the options are `gate.decisions` with the labels from Global Constraints;
   - `{ id: 'note', kind: 'text', prompt: 'Note for the next attempt (optional)', required: false }`.

   Then feed `decide` with the note when it is not empty.
2. **The terminal:**
   - The answerer is `deps.answer`, else `terminalAnswerer` on a TTY, else none.
   - Agent questions without a terminal still get `noTerminal`.
   - Prompts take turns, first come first served. An agent's batch is headed `-- <step> asks:`.
   - Lines shown while a prompt is open wait, and print after it.
   - Keep the terminal (turn-taking and held lines) as one small closure in `flow-run.ts`. The ask path uses `deps.answer` for gates and agent questions alike.

- [ ] **Step 1: Write the failing tests**

They use Task 9's `scripted` helper and fixture head.

- **No outcome:** an `on_pass` edge goes from `review` to `ship`; review plays `none`; `deps.answer` approves.
  - The decision question has prompt `review: no outcome reported` and option values `['approve', 'retry', 'fail']`, since review has no `on_fail` edge.
  - `-- review needs a decision` is printed; ship runs; exit 0.
- **Escalation:** build has `max_attempts: 2`; check is `shell: 'echo FAIL; exit 1'`, with an `on_fail` edge to build; the answer is `fail`.
  - The prompt is `build: build has used 2 of 2 attempts`, and the help names `check_output.md`.
  - Expect exit 1, and output ending `-- flow failed: …`.
- **Parallel questions** (Review Focus 3): `plan → [a, b]`, where a and b play `ask`. `deps.answer` counts overlapping calls.
  - The overlap is never more than 1.
  - Both `-- a asks:` and `-- b asks:` are printed.
- **Missing output:** plan plays `['no-output', 'pass']`, and the answer is `retry`.
  - The prompt is `plan: did not write: plan`.
  - Plan's second run is attempt 2; exit 0.
- **Infra failure:** plan plays `['error', 'pass']`, and the answer is `retry`.
  - The prompt is `plan: run failed: boom`, with option values `['retry', 'fail']`.
  - The second run is attempt 1; exit 0.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/flow-run.test.ts`
Expected: the new tests fail; the earlier ones pass.

- [ ] **Step 3: Implement the gates and the terminal in `flow-run.ts`**

Use the rules above.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test packages/cli/test/*.test.ts && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/flow-run.ts packages/cli/test/flow-run.test.ts
git commit -m "feat(cli): run-flow asks at gates, and agents' questions take turns in one terminal"
```

---

### Task 11: Stop, resume and the state file

**Files:**
- Modify: `packages/cli/src/flow-run.ts`
- Test: `packages/cli/test/flow-run.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 9 and 10, including Task 9's `stopAll()`.
- Produces:
  - `run-flow --resume <run folder>` continues a stopped, paused or crashed flow from `flow.json` and `state.json`.
  - Ctrl+C exits 130.

Rules:

1. **Ctrl+C, SIGTERM and SIGHUP** behave like `run-agent`'s (R13, R29):
   - **First press:**
     1. Print `-- stopping`.
     2. Abort open gate prompts, and call Task 9's `stopAll()`.
     3. Finish stopped (exit 130), printing `-- flow stopped: …` and the `--resume` hint.
   - **A press more than 300 ms after the first:** `deps.exit(130)`.
   - **Ctrl+C at a prompt** (`ExitPromptError`, from a gate or an agent question) counts as the first press.
2. **`--resume <dir>`:**
   - Resolve the folder against cwd. Read `flow.json` and `state.json`, take the lock as Task 9 does, print `-- resuming <dir>`, and feed `{ type: 'resume' }`.
   - The YAML is never read again, and uncommitted changes are not checked: the tree now holds the flow's own edits.
   - Errors (exit 2, as `<dir as typed>: cannot resume: …`), in this order:
     - `no state.json`;
     - `made by a different version of run-flow`, when `flow.json`'s `version` is not 1;
     - `the flow already ended (<status>)`;
     - Task 9's lock line, when a live run-flow holds the folder.
3. **`state.json` is written atomically:** write `state.json.tmp`, then rename it. A stray `.tmp` file is ignored.

- [ ] **Step 1: Write the failing tests**

- **Ctrl+C during a run:** `build` plays `hang`; emit `SIGINT` once its run has started.
  - Expect exit 130, with `-- stopping`, `-- flow stopped:` and `-- continue with: pnpm run-flow --resume runs/2026-10-18T09-05-07-flow` printed.
  - In `state.json`, `steps.build.state` is `running`, and run 1 has `live: false` and `wasted: true`.
  - Then `runFlow(['--resume', 'runs/2026-10-18T09-05-07-flow'], deps)` with build playing `pass` exits 0. The new build run is attempt 1.
- **Hanging check** (Review Focus 5): check is `shell: 'test -f go.flag || sleep 30'`.
  - Ctrl+C while it runs resolves with 130 in under 2 s.
  - The test then creates `proj/go.flag`, and `--resume` reruns check, which exits 0 at once; exit 0.
- **Pause, then resume:** paused at a gate (exit 3), then resumed with `deps.answer` approving; exit 0.
- **The pinned flow:** deleting `flow.yaml` before `--resume` changes nothing (`flow.json` is used).
- **Resume errors:**
  - resuming a finished flow exits 2 with `runs/…: cannot resume: the flow already ended (done)`;
  - `--resume runs/nope` exits 2 with `runs/nope: cannot resume: no state.json`;
  - a `flow.json` with `version: 2` exits 2 with `runs/…: cannot resume: made by a different version of run-flow`;
  - a lock holding this process's pid exits 2 with `runs/…: cannot resume: another run-flow (pid …` and the rest of the lock line.
- **Atomic state:** after a run, no `state.json.tmp` remains, and a stray `state.json.tmp` written before `--resume` is ignored.
- **Second press:** a second `SIGINT` more than 300 ms after the first calls `exit(130)`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test packages/cli/test/flow-run.test.ts`
Expected: the new tests fail.

- [ ] **Step 3: Implement stopping, resuming and the atomic save**

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test:packages && pnpm typecheck:packages`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/flow-run.ts packages/cli/test/flow-run.test.ts
git commit -m "feat(cli): run-flow stops cleanly on Ctrl+C and resumes from its state file"
```

---

### Task 12: A live flow on both providers, and the reference

**Files:**
- Create: `packages/cli/test/flow-live.test.ts`, `docs/FlowBoard/Agent Providers/Run Flow Reference.md`
- Modify: `package.json` (append `packages/cli/test/flow-live.test.ts` to `test:live`), `docs/FlowBoard/Agent Providers/Agent Providers Index.md` (link the reference next to Run Config Reference)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the live test**

It is skipped unless `FLOWBOARD_LIVE=1`, with a 300 s timeout, using `cli-live.test.ts`'s pattern. The flow:

```yaml
folder: proj
task: task.md          # "Write the single word hello, in lowercase, into your output file. Nothing else."
defaults: { limits: { max_turns: 6, budget_usd: 0.3 } }
steps:
  write: { adapter: claude-code, model: haiku, prompt: write.md, produces: [greeting] }
  check: { shell: 'grep -qi hello "$FLOWBOARD_ARTIFACTS/greeting.md"', produces: [check_output] }
  judge:
    adapter: opencode
    model: openrouter/deepseek/deepseek-v4.1-flash   # or $FLOWBOARD_OPENCODE_MODEL
    prompt: judge.md     # "Read the greeting file. Report pass if it contains the word hello, otherwise fail."
    requires: [greeting]
edges:
  - { from: write, to: check }
  - { from: check, to: judge, condition: on_pass }
  - { from: check, to: write, condition: on_fail }
  - { from: judge, to: write, condition: on_fail }
```

Assertions:
- the exit code is 0 (show the output on failure);
- `state.json` status is `done`;
- the judge's last run has outcome `pass`, and its `.outcome.json` file exists, which proves `set_outcome` worked on OpenCode.

- [ ] **Step 2: Run it**

Run: `FLOWBOARD_LIVE=1 node --test packages/cli/test/flow-live.test.ts`
Expected: PASS. It costs a few cents of Claude quota and OpenRouter credit.

If the judge does not call `set_outcome`, the run pauses at a gate and the test fails. Fix the closing copy or the prompt rather than relaxing the assertion.

- [ ] **Step 3: Write `Run Flow Reference.md`**

Mirror `Run Config Reference.md`'s style:
- an example;
- the commands and exit codes;
- the flow and step fields (run-agent keys by reference);
- edges, loops and joins;
- gates and their choices;
- the files written;
- the *Decisions this plan makes* table, as "Rules this command settles", with the open-question numbers.

Every value must match the code's copy.

- [ ] **Step 4: Run everything**

Run: `pnpm test:packages && pnpm typecheck:packages`
Expected: all pass, with live tests skipped.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/test/flow-live.test.ts package.json "docs/FlowBoard/Agent Providers/Run Flow Reference.md" "docs/FlowBoard/Agent Providers/Agent Providers Index.md"
git commit -m "test(cli): live flow across Claude Code and OpenCode; docs: run-flow reference"
```
