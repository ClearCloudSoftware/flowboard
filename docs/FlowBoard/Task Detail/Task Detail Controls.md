---
tags: [flowboard, task-detail, screen, controls, keyboard]
module: Task Detail
---

# Task Detail Controls

Every control on the screen, from the mockup's markup and handlers and the guide's *Every control* tables. "Wired" means it does something in the mockup.

## At the gate

| Control | Key | What it does (guide) | Money (guide) | Wired |
|---|---|---|---|---|
| **Approve** | `a` | *"Clears the gate. The next step queues immediately and the task finishes without you."* | *"Free — nothing is re-run, nothing is wasted."* | yes |
| **Send back** | `r` | *"Opens a reason box. Review is discarded, build re-queues as the next attempt carrying your reason, and tests are left alone."* | *"The build's kept spend moves to wasted."* | yes |
| Reason field | — | placeholder *"Why — this goes to the next build attempt"*, prefilled; autofocused when opened | — | partly (see below) |
| **Send back to build** | `Enter` (form submit) | submits the reason; empty becomes *"needs another pass"* | — | yes |
| **Cancel** (reason box) | `Esc` | closes the reason box | — | button yes; `Esc` partly (see below) |
| **Compare plan vs built** | — | *"Jumps to the tab you should read before deciding either way."* | — | yes |

The gate buttons hide while the reason box is open.

> [!warning] The mockup's reason box can't be edited
> A 1 s timer (`setInterval(() => { if (gateStep() && !ticker) render(); }, 1000)`) redraws the gate banner while a gate is open, and the reason box with it. Each redraw rebuilds the `<input>` with its prefilled value, so typed text and focus are lost within a second, and a submit nearly always sends the prefilled reason. `Esc` is ignored while focus is in the field, so it only works once a redraw has taken focus away. See [[Task Detail Open Questions]] #32.

## On the task

| Control | Shown when | What it does (guide) | Money (guide) | Wired |
|---|---|---|---|---|
| **‹ Board** | always | back to the board (mockup; not in the guide's tables) | — | no |
| **Pause** | not done | *"Stops after the current run rather than mid-flight. The workspace stays."* | *"Stops future spend only."* | no |
| **Send to backlog** | not done | *"Returns the task to the backlog, keeping its workspace and everything it produced."* | *"Same."* | no |
| **Cancel task** | not done | *"Stops any running agents and tidies up. The workspace survives until you clean it up."* | *"Anything in flight becomes wasted."* | no |
| **Open workspace** | done | not described | — | no |
| **Clean up workspace** | done | *"Only offered once the task is finished or cancelled. Removes the branch and the folder."* | — | no |

None of these asks for confirmation in the mockup. Cancel is styled as a danger button. See [[Task Actions]].

## Reading

| Control | What it does (guide) | Wired |
|---|---|---|
| A spine segment | *"Jumps to that step in the Story tab and expands it."* Scrolls it to centre. | yes |
| A tab | switches tab, scrolls to top (mockup; the guide's *Reading* table has no tab row) | yes |
| A story row | *"Expands the run: its log, the question you answered, the failed attempt, the artifact it wrote."* | yes |
| A plan row | *"Expands the diff hunk behind that verdict."* | yes |
| An artifact chip | *"Opens the file in a formatted viewer. Everything is an ordinary file on the task's branch."* | no |

## Keyboard

| Key | Action | Condition |
|---|---|---|
| `a` | Approve the open gate | a gate is open |
| `r` | Send it back, opening the reason box | a gate is open |
| `Esc` | Cancel the reason box | the reason box is open and focus is not in the field |
| `1` – `4` | Switch tab: story, plan, files, cost | — |
| `←` `→` | Step through the walkthrough | guide page, with focus inside the walkthrough |

Keys are ignored while focus is in an input, textarea or select, and when ⌘ or Ctrl is held. The status bar shows `a approve · r send back` only while a gate is open.

> [!note] Consistent with the other screens
> The monitor and inbox use the same `a` / `r` for approve and send back. The monitor and inbox use `j` / `k`. No board mockup exists. Backlog Story 2.2 gives the board's flow strip `h` / `l` (pan) and `[` / `]` (jump), asks for `Enter` to open a card (**GAP**), and says to *"Either implement the `a` (approve) shortcut or remove the chip"* (**BUG**). Task detail has no row navigation keys, so story rows, plan rows and spine segments are reached by Tab and mouse. Backlog Story 2.2 makes `Enter` open the focused board card (*"Card focus model + `Enter` opens the sheet"*). Feature map, *Across everything*: *"fully usable from the keyboard, and friendly to screen readers."*

## Accessibility in the mockup

- Every interactive element except the reason `<input>` is a `<button>`, with `aria-expanded` on story and plan rows and `aria-selected` on tabs.
- `:focus-visible` draws a 2 px petrol outline.
- The waiting segment is hatched *"so it reads as blocked without relying on colour"*.
- Icons are `aria-hidden`. Their meaning is repeated in text: the pill wording, the row meta.
- Missing: no `role="tablist"` / `role="tab"` on the tabs, and no live region for the ticking timer or the gate banner appearing.

## Related

- [[Task Detail Index]]
- [[Task Detail Screen]]
- [[Deciding At A Gate]]
- [[Task Actions]]
