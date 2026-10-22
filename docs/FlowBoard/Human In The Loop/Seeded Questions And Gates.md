---
tags: [flowboard, human-in-the-loop, seed]
module: Human In The Loop
---

# Seeded Questions And Gates

What ships so the question loop and the gates work on first run, and the mockups' sample content.

## In the seeded flow

*Software delivery* (PRD §15; Capability Library **D26**, [[Capability Library Decisions]]). Execution: [[Seeded Flow Execution]].

| Step | HITL role | Source |
|---|---|---|
| `grill` (*Grill me*, skill `/grill-me`, sonnet medium) | The asker. Requires `research_brief`, produces `questions`, `answers` | PRD §15 |
| `plan` (*Plan*, `architect` + `/plan-implementation`, opus high) | Reads your answers: requires `research_brief`, `answers` | PRD §15 |
| `explain` (*Explain plan*, `/explain-simply`, haiku low) | **approval** gate, *"the cheap point to stop a bad plan before two opus-high steps run"* (Capability Library **D26**) | PRD §15 |
| `review` (*Code review*, `reviewer` + `/code-review`, opus high) | **approval** gate; *"must call `set_outcome`"*; `on_fail` → `implement` | PRD §15 |
| `check` (shell) → `implement` on `on_fail` | Spent or stuck loops escalate to a gate | PRD §8, §15 |

Acceptance: *"`explain` and `review` stop and wait for my approval; the rest advance automatically"* and *"`/grill-me` asks a batch of questions that appear in `/inbox` with correct controls per kind"* (PRD §16).

The mockups' seed flow gates only `review` and has no check step, and the old handoff gated the plan. Flow Design settles this in favour of the PRD via Capability Library D26 ([[Flow Design Open Questions]] #29).

## Seeded skills that ask or decide

| Skill | Contract | Source |
|---|---|---|
| `grill-me` | *"uses `ask_user_batch` and honours `no_answer_yet`"*. The capability-library mockup: *"Pose a batch of questions in one go and honour no_answer_yet so the run parks instead of hanging"*, manifest `invokes: ask_user_batch`, `honours: no_answer_yet`, tools `Read` only | backlog Story 1.2; `05` §13; `capability-library.html` |
| `code-review` | *"calls `set_outcome`"*; *"told to look for failures, not to confirm the work"*. The capability-library mockup: *"call set_outcome with a verdict and its reasoning"* | backlog Story 1.2, PRD §15, `capability-library.html` |
| `ask-three` | The M4 smoke test: *"a trivial skill that asks three questions of different kinds"*. **A test fixture, not a seed** (Capability Library **D30**) | PRD §14, §15; backlog Story 1.2 |

That `grill-me` may use only `Read` is a reason PRD §7 always appends `mcp__vibe__*` to `--allowedTools` (our reading; see [[Ask User MCP Server]]). As built, each adapter pre-approves every injected server whatever the allow list says (`mcp__flowboard__*` on Claude, `flowboard_*` on OpenCode), so a `Read`-only list still leaves `ask_user`; an explicit deny wins (2026-10-22).

## Seeded artifact types

`questions` and `answers` are among the ten seeded types (PRD §6).

## Mockup sample content

The inbox mockup's `ITEMS`, `RUNNING` and `ANSWERED` (see [[Inbox Card Kinds]] for the queue):

| Recently answered | Question | Answer | Via |
|---|---|---|---|
| `flow-versioning · plan` | *Pin to the flow version, or the latest?* | Pin to the version | web, 14m ago |
| `inbox-keyboard · review` | *Approve the keyboard map?* | Approved | slack, 38m ago |
| `cost-rollup · research` | *Roll up by model, or by step?* | Both | web, 1h 02m ago |

Counters start at 11 answered today, a median reply of `3m 20s`, and `$19.46` today with `$2.55` wasted.

The task-detail mockup's plan step asked *"Rotate on every use, or only when the refresh token is near expiry?"* and was answered *"Every use"* after `2m 14s`. Its log says *"? asked you 2 questions"*, but its aside says one question and only one is defined ([[Task Detail Open Questions]] #25). The monitor guide's version reads *"close to expiry"*. The monitor mockup seeds an `inbox-keyboard` task, *"Number-key answers, no mouse, in the inbox"*, and its own questions for `csv-export` and `provider-codex` (see [[Inbox Card Kinds]]).

The old design handoff's examples: *"Maximum retry window?"* → *1 hour / 6 hours / 24 hours*; a batch of six; *"questioning step usually asks 5–8"*. Backlog Story 9.3 still lists the empty state's *"usually asks N"* as a **GAP**.

## Related

- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Question Batches]]
- [[Approval Gates]]
- [[Seeded Flow Execution]]
