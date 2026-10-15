---
tags: [flowboard, human-in-the-loop, concept, questions]
module: Human In The Loop
---

# Question Shapes

> **One shared question format** — A simple set of shapes (yes/no, pick-one, pick-many, free text, a number) that looks and works the same everywhere you might answer. — feature map §11

> [!important] Why only five
> *"Agents can only ask in these five shapes, and the same shape looks and behaves the same everywhere you might answer it — here, or in chat. That constraint is what makes a keyboard contract possible at all: the number keys can always mean something."* — inbox guide

## The five shapes

| `kind` (PRD) | Guide label | Mockup `type` | For (inbox guide) | Keyboard (inbox guide) |
|---|---|---|---|---|
| `yes_no` | yes / no | `yesno` | *"A decision with exactly two outcomes. The cheapest possible question and the one agents should reach for first."* | `1` Yes, `2` No |
| `single_select` | pick one | `one` | *"Several mutually exclusive routes. A well-written one includes an option that hands the choice back — 'you decide' — so a non-expert is never stuck."* | `1`–`9` select and replace |
| `multi_select` | pick many | `many` | *"A set where more than one can be true. The checkbox is the tell, and it is the only shape where a number key toggles rather than replaces."* | `1`–`9` toggle |
| `number` | a number | `num` | *"A quantity with a unit and a sensible default already filled in, so accepting it is the fast path."* | type, or accept |
| `text` | free text | `text` | *"Anything that cannot be narrowed to options. Usually the last question in a batch, and usually optional."* | type |

The old design handoff used a fourth naming, `'yes_no'|'single'|'multi'|'text'|'number'`. **Proposal:** the PRD kinds are canonical and the guide labels are display text. See [[Human In The Loop Open Questions]] #10.

## Controls on each surface

| Kind | Inbox mockup | PRD §10 (shadcn) | Old design handoff 1a | Slack (PRD §10) |
|---|---|---|---|---|
| `yes_no` | Two option buttons, keys `1` `2` | *"two shadcn Buttons, Yes / No"* | Two buttons with keys `y`, `n` | *"an `actions` block of buttons, one per option"* |
| `single_select` | Option buttons, keys `1`–`n` | *"RadioGroup, or Buttons if ≤3 short options"* | ≤3 short: outline buttons; otherwise RadioGroup | buttons, one per option |
| `multi_select` | Option buttons with a checkbox, keys toggle | *"Checkbox list with a Submit button"* | 2-column checkbox grid, `Submit 2 selected`, *"or press 0 for none"* | *"a `multi_static_select`"* (backlog 6.2: *"+ submit"*) |
| `text` | Textarea with a placeholder | *"Textarea, Cmd+Enter to submit"* | Textarea, placeholder *"Free text, or leave blank…"*, `⌘↵` | *"a button that opens a modal with a `plain_text_input`"* |
| `number` | Number input with a unit and a default (`50000 rows`) | *"Input type=number"* | 72px input with a hint *"integer · 1–64"* | modal with a `plain_text_input` |

## The rule the keyboard depends on

> [!note] Toggle vs replace
> *"Number keys toggle in a pick-many. In every other shape they select and replace. It is the one place a key does something different, and the checkbox in the control is what tells you which you're in."* — inbox guide
>
> *"Only the pick-many toggles. Everywhere else a number key replaces your previous choice, so a misfire is one keystroke to fix."* — inbox guide walkthrough, beat 4

## When a shape counts as answered

From the mockup's `answered()`:

| Kind | Answered when |
|---|---|
| `text` | Always. *"free text may be left blank"* |
| `multi_select` | At least one option picked |
| `number` | A value is present, or the pre-filled default is left in place (*"accepting it is the fast path"*, inbox guide) |
| `yes_no`, `single_select` | An option is picked |

The guide: *"Free text counts as answered even when empty, because 'nothing to add' is a real answer. Every other shape has to be given a value before Submit lights up."* The PRD makes `required` a per-question flag instead. See [[Answering Rules]] and Open Questions #11 and #13.

## Fields the shapes need

The mockup's number question carries `unit` and `def` (default). Its text question carries `placeholder`. The old handoff's number shows a range hint (*"integer · 1–64"*). None of these is a column in `questions` or a field of `Question`. **Proposal** in [[Human In The Loop Data Model]]; see Open Questions #12.

## Related

- [[Questions]]
- [[Question Batches]]
- [[Human In The Loop Controls]]
- [[Escalation To Chat]]
