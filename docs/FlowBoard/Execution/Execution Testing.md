---
tags: [flowboard, execution, testing]
module: Execution
---

# Execution Testing

How the sources plan to prove execution works without spending money.

## Why it matters

The backlog's first lesson: *"**Milestone verification was curl + sqlite only.** No browser was ever driven"*, and *"**Worker restart kills live runs.**"* (backlog intro). Feature map *Across everything*: *"**Testing** — being able to exercise the whole system (including fake, free agents) so changes don't quietly break things."*

## The lanes

| Lane | What | Source |
|---|---|---|
| Unit | *"`pnpm test` = `tsx --test --test-concurrency=1` on a throwaway `VIBE_DB_PATH`; concurrency 1 because tests share one SQLite file."* | backlog 0.2 (**FIX**) |
| Engine rules | *"vitest on engine rules, fingerprinting and the prompt builder"* | drawio *Test lane* |
| Integration | *"spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend."* | backlog 0.2 (**GAP**); the capture is at `docs/old/stream-sample.jsonl` |
| Whole flows | *"ReplayProvider drives whole flows at $0"* | drawio *Test lane* |
| Sandbox | *"integration lane runs a step in a container against the fake `claude`; assert egress denied except allowlist, and that `bypassPermissions` is refused on the `host` tier."* | backlog 3.5 (**GAP**) |
| E2E | *"Playwright E2E against the real UI (v1 shipped without one)"* | drawio; backlog 0.2 |

> [!note] Two test runners
> Backlog 0.2 names `tsx --test`; the drawio names `vitest`.

## ReplayProvider

*"Promote the backlog's fake-`claude` test harness to a first-class adapter: `launch()` replays a recorded `NormalizedEvent` stream … with scripted timing. Every engine, park/resume, and cost test runs deterministic and zero-spend."* (`01-ports.md`)

The reference adapter (`replay-provider.ts`) has a self-check: replay `system`, `assistant_text`, `result` and assert the session id, `exitCode 0`, `outcome 'pass'`, and `costUsd 0.012`. It reports `stop()` as `exitCode: 130, error: 'stopped'`.

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
- [ ] Rejecting a review sends the task back to `implement` as attempt 2, and three failed attempts fail the task *(conflicts with PRD §8; see [[Loop Guard And Escalation]])*
- [ ] Draft mode forces every step to haiku/low
- [ ] A question left for 20 minutes parks the run; answering resumes it with the answers in context
- [ ] With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition
- [ ] Recall and commit happen host-side; a sandboxed run needs no egress-allowlist entry for the memory store

The park test does not need to wait 20 minutes: *"timeout overridable by `VIBE_ASK_TIMEOUT_MS` for tests"* (backlog 4.1). The M4 proof uses a test fixture: *"The M4 three-question skill (`ask-three`) is a test fixture loaded by the test setup, not a seed."* (PRD §15)

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Execution Roadmap]]
