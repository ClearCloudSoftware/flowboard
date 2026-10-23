---
tags: [flowboard, agent-providers, how-to, cli]
module: Agent Providers
date: 2026-10-20
---

# Run Flow Review Loop

How to have a reviewer agent send the work back to the implementer agent when it finds an issue, until a review passes. The rules behind it are in [[Run Flow Reference]] (*Loops*), and scenario 17 in [[Testing The Run Flow CLI]] runs a small version of it.

## The three parts

- **An `on_fail` edge** from the reviewer back to the implementer. That edge is the loop. It leaves no step without an edge into it, so the flow names its first step with `entry:`.
- **A verdict.** The reviewer reports pass or fail with the `set_outcome` tool. You don't have to ask for it: a step with an `on_pass` or `on_fail` edge gets a closing line in its prompt that does.
- **A file of issues.** The reviewer writes what it found into an output (`produces`). On the rerun, that file is the implementer's input. Without one, `--check` warns: `-- warning: steps.review: reworks "implement" on a failure but produces nothing, so implement runs again without seeing why`.

## The flow

```yaml
budget_usd: 6      # the most the whole loop may spend, every round included; 0 for no ceiling
entry: implement   # every step has an edge into it, so name the first
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  implement: { prompt: prompts/implement.md, produces: [notes], max_attempts: 3 }
  review:
    prompt: prompts/review.md
    requires: [notes]
    produces: [review_notes]
    guards: { deny_paths: ["src/**", "tests/**"] }   # it reports issues; it doesn't fix them
edges:
  - { from: implement, to: review }
  - { from: review, to: implement, condition: on_fail }   # the loop
```

`prompts/implement.md`:

```
Do the task, then write a short summary of what you changed into your output file.
If a review is among your inputs, fix every issue it lists first.
```

`prompts/review.md`:

```
Review the change described in your input notes, and read the code it touched. Change no file but your output file.
Write every issue you find into your output file, one per line: the file, and what to fix.
If you find none, write "No issues." Always write the file.
Fail only for bugs, missing parts of the task or broken tests. Mention style points, but still pass.
```

Save the flow as `review-loop.yaml`, with `prompts/` beside it. A flow file is a reusable recipe: its prompt paths resolve against its own folder, and each run names the folder to work in and the task:

```
pnpm run-flow --folder proj --task task.md review-loop.yaml
```

`pnpm run-flow --check review-loop.yaml` checks the recipe on its own: `-- flow ok: 2 steps, starting at implement`.

## What happens

1. `implement` runs and writes `notes`.
2. `review` reads the notes and the code, writes the issues into `review_notes`, and reports `fail`.
3. The `on_fail` edge fires. `implement` runs again as attempt 2, with `review_notes` added to the files its prompt lists under *Read these first:*. The two runs so far now count as wasted.
4. `review` runs again from scratch, as attempt 1 again: only the implementer's count carries over.
5. A review that passes ends the flow, since no edge leaves `review` on a pass. If the review still fails after `implement`'s third attempt, the flow stops at a gate, `implement has used 3 of 3 attempts`: Retry gives one more attempt, and Fail the flow ends it.

## Things to get right

- **The issues go in the file.** The one-line reason given with `set_outcome` is kept in `state.json` (the run's `reason`), in the run's outcome file (`<NNN>-review.outcome.json` in the run folder) and in its log. The terminal shows it only at a gate, or cut short in the agent's `tool_use` line. The implementer reads only the reviewer's outputs.
- **The reviewer always writes the file.** On a rerun the file still holds the last review, and a copy left by an earlier run doesn't count. A review that passes without writing it stops at `did not write: review_notes`, hence *write "No issues."*
- **Say what is worth a fail.** A reviewer told only to fail work that doesn't meet the task tends to find something every round, and spends every attempt.
- **Keep the reviewer from fixing the work.** A reviewer that edits the code and then passes leaves the implementer unaware, and its own fix unreviewed. Say so in its prompt, and back it with `guards.deny_paths` ([[Run Config Reference]]). Path guards cover the agent's file-editing tools, not its shell commands, which meet only `deny_commands` and the recursive-`rm` check.
- **The limit is the implementer's.** `max_attempts` on `implement` bounds the loop. A check that also loops back to `implement` on a failure draws on the same attempts. On `review` it is refused: `steps.review.max_attempts: no rework route leads back to review, so nothing reads it`.
- **Cap what the loop spends.** `budget_usd` is the most the whole flow may spend, every round included, and `0` means no ceiling. Size it from the worst case: three rounds are six Sonnet runs, so at about $1 a run, `6`. Each agent run may spend only what is left. Once it is spent, the flow stops its runs and pauses, with exit 3, and `pnpm run-flow --resume <run folder> --budget-usd <more>` carries on.

## Variations

- **Another provider reviews.** Give `review` `adapter: opencode` and an OpenCode `model:`, as the live test's judge does. If OpenCode has no price for the model, its runs count as $0, so neither the flow's `budget_usd` nor a step's `limits.budget_usd` can stop them, and the terminal says so: `-- review: no price for <model>: its cost shows as $0, and limits.budget_usd cannot stop it`.
- **A person confirms each verdict.** Add `gate: approval` to `review`. The gate shows the reviewer's verdict and reason, `review: approval needed; it reported fail: <reason>`. Approve passes, over the agent's verdict, and ends the flow, so a note typed there reaches no run. Reject sends the work back, with your note in the implementer's next prompt. Once `implement` has used its attempts, Reject stops at the `implement has used 3 of 3 attempts` gate instead, and Retry there passes your note on unless you type a new one.
- **Tests before the review.** Put a shell step between the two: `implement → check`, `check → review` on a pass, `check → implement` on a fail. Give the check `produces: [check_output]`, so that `implement` sees why it failed. The *At a glance* flow in [[Run Flow Reference]] does this.

## Related

- [[Run Flow Reference]]
- [[Testing The Run Flow CLI]]
- [[Run Config Reference]]
- [[Agent Providers Index]]
