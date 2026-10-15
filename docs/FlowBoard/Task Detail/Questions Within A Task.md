---
tags: [flowboard, task-detail, behaviour, questions]
module: Task Detail
---

# Questions Within A Task

Task detail is not where questions get answered (that is the inbox), but it is where they are **recorded** as part of the task's story.

## On the screen

**Story row** (Plan, expanded) shows an ochre-bordered block:

> Rotate on every use, or only when the refresh token is near expiry?
> you answered **Every use** after 2m 14s — the run resumed where it stopped

The log carries the pause: `? asked you 2 questions — paused, billing stopped`, then `✓ resumed with your answers`.

**Aside, *you were asked***: *"1 question, answered in 2m 14s"*, plus *"1 approval still open"* in ochre while a gate is open.

**Cost tab**: *"Answering is free. Plan paused for $0.00 while it waited 2m 14s on your answer"*.

> [!question] One question or two?
> The Plan log says *"asked you 2 questions"*. The story row and the aside show one question and *"1 question"*. The mockup data holds only one. See [[Task Detail Open Questions]].

## The mechanism (sources)

- Questions belong to a task and, optionally, a step instance and run: `questions.task_id`, `step_instance_id`, `run_id`, `batch_id` (PRD §5).
- Five kinds: `yes_no`, `single_select`, `multi_select`, `text`, `number` (PRD §5).
- The agent asks through `ask_user_batch` or `ask_user`, which block until answered (PRD §9).
- After 20 minutes the broker returns `no_answer_yet`. The run goes `parked`, the instance stays `awaiting_answers`, and the last answer enqueues a resume with `--resume <claude_session_id> --fork-session` (PRD §9). Backlog Story 4.2 also sets the task `blocked`.
- *"agent emits a `questions` artifact → engine **parks** the run → human answers → engine **resumes** with an `answers` artifact in context."* (`04` §9)
- *"On any run failure, **cancel that step's pending questions**"* (`04` §9, backlog Story 3.2). Cancelling a task cancels them too (backlog Story 2.1).
- An answer remembered by memory need not be asked again: *"Remember your answers — When you answer a question in the inbox … The next task doesn't ask you the same thing again"* (feature map §21).

`questions.answered_via` (`web` / `slack`) and `answered_at` record **where and when** it was answered, not who (there is no user table, PRD §2). The mockup shows neither. The inbox mockup shows answers arriving from chat.

## The same question in the monitor guide

The monitor guide's walkthrough asks the same question about `auth-refactor`: *"Rotate on every use, or only when the refresh token is close to expiry?"*, with options `1 Every use · 2 Near expiry · 3 Decide it yourself`. Task detail words it *"…near expiry?"* and records the answer **Every use**.

## Related

- [[Task Detail Index]]
- [[Step Instances And Runs]]
- [[Task Cost And Wasted Spend]]
- [[Memory Carried Into A Task]]
