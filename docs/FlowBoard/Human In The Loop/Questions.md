---
tags: [flowboard, human-in-the-loop, concept, questions]
module: Human In The Loop
---

# Questions

> **Pause and pick back up** — If you don't answer within a while, the agent saves its place and stops rather than hanging; when you answer, it resumes right where it left off with your answers in hand. — feature map §11

## What a question is

A question is one thing a running agent needs you to decide. The agent asks through the `ask_user` or `ask_user_batch` MCP tool. On that path each question becomes a row in `questions`, and the broker is the only process that writes those rows (PRD §9). Without MCP, the agent writes a `questions` artifact and exits, and "that *is* the batch" (`04` §9). No source says whether fallback questions also become rows ([[Human In The Loop Open Questions]] #8).

PRD §9 calls the broker *"the only writer of the `questions` table"*, yet answers land in that table's `answer`, `answered_at`, `answered_via` and `state` columns through `apps/web` endpoints (§12). Which process writes them is open: [[Human In The Loop Open Questions]] #36.

## The one schema

> [!quote] `04-hitl-and-notify.md` §9
> "the `questions` artifact *is* the schema. One JSON shape — `{ id, prompt, help?, kind, options?, required? }` per question, five `kind`s (`yes_no|single_select|multi_select|text|number`) — drives three renderers with zero divergence: the MCP tool return, the `/inbox` controls, and the Slack/Discord blocks (10). Define it once in `core/hitl`."

The reference type (`docs/old/reference/core/hitl/question.ts`):

```ts
export type QuestionKind = 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  prompt: string;
  help?: string;
  kind: QuestionKind;
  /** Present for the select kinds. */
  options?: QuestionOption[];
  /** Defaults to true; a run parks only while a *required* question is unanswered. */
  required?: boolean;
}
```

## Fields

| Field | Meaning | Source |
|---|---|---|
| `id` | Question id | PRD §5, §9 |
| `prompt` | The question text | PRD §5 |
| `help` | Optional help text, shown under the question. The mockup's `note` (e.g. *"Streaming is cheaper but holds a connection open for the whole export."*) | PRD §5, old design README 1a |
| `kind` | One of five shapes | PRD §5. See [[Question Shapes]] |
| `options` | *"JSON array of {value,label} for select kinds"* | PRD §5 |
| `required` | Default 1 (PRD §5). *"a run parks only while a required question is unanswered"* (the reference `question.ts`) | PRD §5, the reference `question.ts` |
| `batch_id` | *"groups questions asked together"* | PRD §5. See [[Question Batches]] |
| `task_id`, `step_instance_id`, `run_id` | Where the question came from | PRD §5 |
| `state` | `pending \| answered \| expired \| cancelled` | PRD §5. See [[Question Lifecycle]] |
| `answer` | JSON | PRD §5 |
| `answered_at`, `answered_via` | When, and `'web' \| 'slack'` | PRD §5 |
| `escalated_at`, `slack_channel`, `slack_ts` | Chat escalation record | PRD §5. See [[Escalation To Chat]] |

## What every question shows

The PRD shows *"per question: task title, step name, how long it has been waiting, and a link to the live session"* (§10). The old brief lists *"the question text, optional help text, the task it belongs to, the step that asked it, how long it has been waiting, and a link to the live session."* The inbox mockup's card header shows `task · step`, *waiting on <who>* when it isn't you, the escalation state, and *waited Xm*. Under that is a one-line summary (`sum`). The schema has no field for the summary: see [[Human In The Loop Open Questions]] #12.

## Writing good questions

The guide puts the burden on whoever wrote the skill:

- *"Free text is the escape hatch, not the default. An agent that asks everything as free text has given up on being answerable in three seconds. If you keep seeing it, the skill posing the questions is the thing to fix."*
- Yes/no is *"The cheapest possible question and the one agents should reach for first."*
- A good pick-one *"includes an option that hands the choice back — 'you decide' — so a non-expert is never stuck."*
- A number comes *"with a unit and a sensible default already filled in, so accepting it is the fast path."*

The prompt's closing part makes asking mandatory: *"this is a headless run, there is no terminal to ask into — use the `ask_user` MCP tool for any question. … A headless agent that ends with 'let me know if you also want tests' is a stuck run."* (PRD §7). The feature map's version: the prompt carries *"a reminder that it's running unattended (so it asks questions the right way instead of stalling)"* (§7).

## Questions are not artifacts' contents

Notifications carry *"the task title and question text … but not artifact bodies or file contents"* (PRD §10). `QuestionContext` holds only `taskTitle`, `stepName` and an optional `sessionUrl` (`notifier.ts`).

## Related

- [[Question Shapes]]
- [[Question Batches]]
- [[Question Lifecycle]]
- [[Human In The Loop Data Model]]
