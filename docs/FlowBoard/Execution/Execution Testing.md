---
tags: [flowboard, execution, testing]
module: Execution
---

# Execution Testing

How the sources plan to prove execution works without spending money.

## Why it matters

The backlog's first lesson: *"**Milestone verification was curl + sqlite only.** No browser was ever driven"*, and *"**Worker restart kills live runs.**"* (backlog intro). Feature map *Across everything*: *"**Testing** — being able to exercise the whole system (including fake, free agents) so changes don't quietly break things."* The pitch promises the fix in the same terms: *"a ports-and-adapters architecture with a replayable fake-agent for tests, a real browser E2E lane, one deterministic import contract, worker restart-recovery, and a written debt ledger."*

## The lanes

| Lane | What | Source |
|---|---|---|
| Unit | *"`pnpm test` = `tsx --test --test-concurrency=1` on a throwaway `VIBE_DB_PATH`; concurrency 1 because tests share one SQLite file."* | backlog 0.2 (**FIX**) |
| Engine rules | *"vitest on engine rules, fingerprinting and the prompt builder"* | drawio *Test lane* |
| Integration | *"spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend."* | backlog 0.2 (**GAP**); the capture is at `docs/old/stream-sample.jsonl` |
| Whole flows | *"ReplayProvider drives whole flows at $0"* | drawio *Test lane* |
| Sandbox | *"integration lane runs a step in a container against the fake `claude`; assert egress denied except allowlist, and that `bypassPermissions` is refused on the `host` tier."* | backlog 3.5 (**GAP**) |
| E2E | *"Playwright E2E against the real UI (v1 shipped without one)"* | drawio; backlog 0.2 |

> [!warning] Two test runners
> Backlog 0.2 names `tsx --test`; the drawio names `vitest`. See [[Execution Open Questions]] #72 and [[Settings And Plumbing Open Questions]] #27.

> [!note] Three test doubles
> The fake `claude` binary (backlog 0.2) drives the whole Claude adapter; the reference `ReplayProvider` (`replay-provider.ts`) replays scripted `NormalizedEvent`s and skips the parser; `01-ports.md` also allows *"a captured `stream-sample.jsonl`"*. Which one each lane uses is open: [[Agent Providers Open Questions]] #20, [[Replay Provider]].
>
> For the adapters' own tests it was decided on 2026-10-18 (#20): Replay stays a `NormalizedEvent` script; the Claude normalizer is tested against a recorded stream (`adapters/test/fixtures/claude-hello.jsonl`), and the Claude provider against a fake `query()` plus small fake `claude` scripts for the process paths, not a stream-replaying binary.
>
> For run-flow's flows (2026-10-23): whole flows run at $0 against a hand-written `scripted` provider in `cli/test/flow-run.test.ts`. It writes outputs and outcome files, asks through the broker and hangs on demand; a run stopped before its end reports tokens and no price, as a Claude run does. One flow test drives the adapters' `ReplayProvider` instead, to check that a run's recorded cost is what its stream reported, also when stopped. No flow test uses a fake `claude` binary: the real adapters meet a flow only in the live test, `cli/test/flow-live.test.ts`.

## ReplayProvider

*"Promote the backlog's fake-`claude` test harness to a first-class adapter: `launch()` replays a recorded `NormalizedEvent` stream … with scripted timing. Every engine, park/resume, and cost test runs deterministic and zero-spend."* (`01-ports.md`)

The reference adapter (`replay-provider.ts`) has a self-check: replay `system`, `assistant_text`, `result` and assert the session id, `exitCode 0`, `outcome 'pass'`, and `costUsd 0.012`. It reports `stop()` as `exitCode: 130, error: 'stopped'`, which PRD §7's *"process killed by a signal"* rule would class as transient ([[Execution Open Questions]] #55).

`03` §6's idea: *"replay any run through `ReplayProvider` from its spec + captured events."*

## Engine scenarios

Backlog 5.3 (**GAP**): *"Keep `tests/flow.test.ts` scenarios (validation, gate, fan‑out, join, rework, cap, approve → done); add: conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts."*

The M5 proof (PRD §14): *"a deliberately failing test in the scratch repo sends the seeded flow from `check` back to `implement` with the raw log, and a run that sets no outcome stops at a gate instead of passing."*

## Acceptance checks for execution

From PRD §16 and backlog 10.1:

- [ ] `pnpm dev` starts Next.js and the worker together
- [ ] Promoting a task creates a git worktree on its own branch
- [ ] A step runs, streams live to `/runs/[id]`, and records a non-zero cost *(backlog 10.1 adds "and live turns/cost during the run")*
- [ ] `explain` and `review` stop and wait for my approval; the rest advance automatically
- [ ] `implement` and `tests` start at the same time and `review` waits for both
- [ ] Rejecting a review sends the task back to `implement` as attempt 2, and three failed attempts fail the task *(conflicts with PRD §8; see [[Loop Guard And Escalation]] and [[Execution Open Questions]] #14)*
- [ ] Draft mode forces every step to haiku/low
- [ ] A question left for 20 minutes parks the run; answering resumes it with the answers in context
- [ ] With memory enabled, a preference answered in the inbox is recalled into the next task's run and not asked again
- [ ] With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition
- [ ] Recall and commit happen host-side; a sandboxed run needs no egress-allowlist entry for the memory store

The park test does not need to wait 20 minutes: *"timeout overridable by `VIBE_ASK_TIMEOUT_MS` for tests"* (backlog 4.1). The M4 proof uses a test fixture: *"The M4 three-question skill (`ask-three`) is a test fixture loaded by the test setup, not a seed."* (PRD §15)

As built in run-flow (2026-10-23), the terminal host's tests cover four of these, on run-flow's own flows rather than the seeded one (all run with `node --test`; see [[Testing The Run Flow CLI]]):

- **A non-zero cost.** The live flow test, `cli/test/flow-live.test.ts` (`FLOWBOARD_LIVE=1`), asserts that a run recorded a cost above zero. Events stream to the terminal and the run's log, not to `/runs/[id]`.
- **Gates and automatic advance.** An approval step waits even when the agent reports an outcome, and approving takes the pass route (`core/test/engine.test.ts`, `cli/test/flow-run.test.ts`).
- **A fan-out and its join.** Both branches run at once, and the join starts only after both end; with `--max-runs 1` they take turns (`cli/test/flow-run.test.ts`, `core/test/engine.test.ts`).
- **Reject and the spent loop.** A Reject's rework reruns its target as attempt 2 (`core/test/engine.test.ts`). A spent loop escalates to a person instead of failing the task, as the run-flow plan has it; only a person's *Fail the flow* fails a flow.

The M5 proof has a counterpart too: a failed check reworks its target, which reads the failing output, and a conditional step with no outcome waits at a gate. Nothing covers `pnpm dev`, promotion, draft mode, parking or memory.

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Execution Roadmap]]
- [[Replay Provider]]
- [[Sandboxing Testing]]
- [[Workspaces Acceptance Checks]]
