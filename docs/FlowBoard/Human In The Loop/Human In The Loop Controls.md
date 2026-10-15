---
tags: [flowboard, human-in-the-loop, screen, controls, keyboard]
module: Human In The Loop
---

# Human In The Loop Controls

> **Built for the keyboard** — Move between questions, pick options with number keys, submit, and approve — all without the mouse — because this is the screen you'll live in. — feature map §12

*"This is the screen with the strongest keyboard claim in the product, and the claim rests on one rule: there is only ever one open card, so a key never has to ask 'which one?'."* — inbox guide

## Every control (inbox guide *Every control*)

### On the open card

| Control | Key | What it does |
|---|---|---|
| An option | `1`–`9` | *"Selects it. In a pick-many it toggles instead, and you can have several on at once."* |
| Submit / Send answer | `↵` | *"Sends the card. Greyed until every required question has a value."* |
| Approve | `a` | *"Clears an approval gate. The next step queues immediately."* |
| Send back | `r` | *"Opens a one-line reason box. The reason is handed to the next attempt."* |
| Allow host & retry | — | *"On a failure: adds the blocked host to that step's allowlist, then re-queues the run."* |
| Retry as-is | — | Re-queues the run unchanged: *"For failures that aren't about the network — a flaky test, a rate limit, a transient error."* (monitor guide) |
| Open the task / Open the log | — | Present in the mockup but not wired |
| Send back · Cancel (reason form) | `↵` / `esc` | Submit or close the reason box |

### Moving around

| Control | Key | What it does |
|---|---|---|
| Next / previous card | `j` `k` (also `↓` `↑`) | *"Closes the current card and opens another. Your answers are kept."* |
| Within a batch | `←` `→` | *"Moves between the questions on one card. Any order is fine."* |
| A pip | — | *"Jumps straight to that question in the batch."* |
| Card header | click | Opens that card |

### In the topbar

| Control | What it does |
|---|---|
| Waiting on me | *"The default. Only what is assigned to you."* |
| Everyone | *"The whole team's queue, including cards waiting on someone else — visible, but theirs to answer."* |

## Keyboard (inbox mockup)

| Key | Action |
|---|---|
| `j` / `↓` | Next card: closes this one, opens the next |
| `k` / `↑` | Previous card |
| `1`–`9` | Pick the option for the question in front of you (toggle in a pick-many) |
| `←` / `→` | Previous / next question within a batch |
| `↵` | Submit the card. **On a gate it approves**; on a failure it allows the host and retries |
| `a` | Approve an open gate |
| `r` | Send it back: opens the reason box |
| `esc` | Cancel the reason box |

Keys are ignored while focus is in an input or textarea, or with `⌘`/`Ctrl`/`Alt` held (mockup `keydown`).

> [!warning] Three things to fix before building
> - **`↵` approves a gate.** The guide lists `↵` as *"Submit the card"*, and the status bar lists approval under `a`. In the mockup, `↵` on an open gate approves it. See [[Human In The Loop Open Questions]] #29.
> - **No submit from inside a field.** Typing in the number or text field sends keys to the field, and `↵` there does nothing; you have to `Tab` to the button first. The PRD's text control submits with `Cmd+Enter`. See #30.
> - **Accessibility is thin.** The mockup gives `aria-label`s to the number and text fields and the pips, `aria-expanded` to card headers and `aria-pressed` to the filter chips. Option buttons have no group role. Backlog Story 9.4 asks for *"labels for every control"*. See #35.

## The key maps across sources

| Key | PRD §10 | `04` §9 | Old handoff | Backlog 4.3 | Inbox mockup | Monitor mockup |
|---|---|---|---|---|---|---|
| `j` / `k` | move between questions | ✓ | move between question rows, crossing batches | ✓ | move between **cards** | move |
| `1`–`9` | pick | ✓ | pick nth option | ✓ | pick / toggle | answer the top question |
| `0` | — | — | none (multi-select) | ✓ | — | — |
| `y` / `n` | — | ✓ | answer yes/no | ✓ | — (`1`/`2`) | — |
| `Enter` | submit | ✓ | submit focused question | ✓ | submit card; approve gate | open |
| `⌘Enter` | text submit | ✓ | submit textarea | ✓ | — | — |
| `Esc` | — | — | clear the focused answer | ✓ | cancel the reason box | cancel |
| `a` | — | approve focused gate | approve focused gate | ✓ (**GAP**) | approve | approve the top gate |
| `r` | — | — | `Retry now` in the error state | ✓ | send back | send back the top gate |
| `←` `→` | — | — | — | — | within a batch | — |
| `g i` / `g b` | — | — | inbox / board | ✓ | — | — |
| `?` | — | — | shortcut sheet | ✓ | — | — |

See Open Questions #28.

## Related

- [[Human In The Loop Screen]]
- [[Question Shapes]]
- [[Approving And Sending Back]]
- [[Decisions Outside The Inbox]]
