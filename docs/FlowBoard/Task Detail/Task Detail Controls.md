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
| Reason field | — | placeholder *"Why — this goes to the next build attempt"*; autofocused when opened | — | yes |
| **Send back to build** | `Enter` (form submit) | submits the reason; empty becomes *"needs another pass"* | — | yes |
| **Cancel** (reason box) | `Esc` | closes the reason box | — | yes |
| **Compare plan vs built** | — | *"Jumps to the tab you should read before deciding either way."* | — | yes |

The gate buttons hide while the reason box is open.

## On the task

| Control | Shown when | What it does (guide) | Money (guide) | Wired |
|---|---|---|---|---|
| **‹ Board** | always | back to the board | — | no |
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
| A tab | switches tab, scrolls to top | yes |
| A story row | *"Expands the run: its log, the question you answered, the failed attempt, the artifact it wrote."* | yes |
| A plan row | *"Expands the diff hunk behind that verdict."* | yes |
| An artifact chip | *"Opens the file in a formatted viewer. Everything is an ordinary file on the task's branch."* | no |

## Keyboard

| Key | Action | Condition |
|---|---|---|
| `a` | Approve the open gate | a gate is open |
| `r` | Send it back, opening the reason box | a gate is open |
| `Esc` | Cancel the reason box | the reason box is open |
| `1` – `4` | Switch tab: story, plan, files, cost | — |
| `←` `→` | Step through the walkthrough | guide page only |

Keys are ignored while focus is in an input, textarea or select, and when ⌘ or Ctrl is held. The status bar shows `a approve · r send back` only while a gate is open.

> [!note] Consistent with the other screens
> The monitor and inbox use the same `a` / `r` for approve and send back. The board and inbox use `j` / `k`. Task detail has no row navigation keys, so story rows, plan rows and spine segments are reached by Tab and mouse. Backlog Story 2.2 makes `Enter` open the focused board card (*"Card focus model + `Enter` opens the sheet"*). Feature map, *Across everything*: *"fully usable from the keyboard, and friendly to screen readers."*

## Accessibility in the mockup

- Every interactive element is a `<button>`, with `aria-expanded` on story and plan rows and `aria-selected` on tabs.
- `:focus-visible` draws a 2 px petrol outline.
- The waiting segment is hatched *"so it reads as blocked without relying on colour"*.
- Icons are `aria-hidden`. Their meaning is repeated in text: the pill wording, the row meta.
- Missing: no `role="tablist"` / `role="tab"` on the tabs, and no live region for the ticking timer or the gate banner appearing.

## Related

- [[Task Detail Index]]
- [[Task Detail Screen]]
- [[Deciding At A Gate]]
- [[Task Actions]]
