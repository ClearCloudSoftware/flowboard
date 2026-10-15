---
tags: [flowboard, human-in-the-loop, seed]
module: Human In The Loop
---

# Seeded Questions And Gates

What ships so the question loop and the gates work on first run, and the mockups' sample content.

## In the seeded flow

*Software delivery* (PRD §15; **D26** in [[Capability Library Decisions]]):

| Step | HITL role | Source |
|---|---|---|
| `grill` (*Grill me*, skill `/grill-me`, sonnet medium) | The asker. Requires `research_brief`, produces `questions`, `answers` | PRD §15 |
| `explain` (*Explain plan*, `/explain-simply`, haiku low) | **approval** gate, *"the cheap point to stop a bad plan before two opus-high steps run"* (Capability Library **D26**) | PRD §15 |
| `review` (*Code review*, `reviewer` + `/code-review`, opus high) | **approval** gate; *"must call `set_outcome`"*; `on_fail` → `implement` | PRD §15 |
| `check` (shell) → `implement` on `on_fail` | Spent or stuck loops escalate to a gate | PRD §8, §15 |

Acceptance: *"`explain` and `review` stop and wait for my approval; the rest advance automatically"* and *"`/grill-me` asks a batch of questions that appear in `/inbox` with correct controls per kind"* (PRD §16).

## Seeded skills that ask or decide

| Skill | Contract | Source |
|---|---|---|
| `grill-me` | *"uses `ask_user_batch` and honours `no_answer_yet`"* | backlog Story 1.2; `05` §13 |
| `code-review` | *"calls `set_outcome`"*; *"told to look for failures, not to confirm the work"* | backlog Story 1.2, PRD §15 |
| `ask-three` | The M4 smoke test: *"a trivial skill that asks three questions of different kinds"*. **A test fixture, not a seed** (Capability Library **D30**) | PRD §14, §15 |

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

The task-detail mockup's plan step asked *"Rotate on every use, or only when the refresh token is near expiry?"* and was answered *"Every use"* after `2m 14s`. The monitor mockup seeds an `inbox-keyboard` task, *"Number-key answers, no mouse, in the inbox"*.

The old design handoff's examples: *"Maximum retry window?"* → *1 hour / 6 hours / 24 hours*; a batch of six; *"questioning step usually asks 5–8"*.

## Related

- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Question Batches]]
- [[Approval Gates]]
