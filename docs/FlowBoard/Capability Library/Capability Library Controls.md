---
tags: [flowboard, capability-library, ui, reference]
module: Capability Library
---

# Capability Library Controls

Every control on the [[Capability Library Screen]].

## In the topbar

| Control | What it does |
|---|---|
| **+ Install from GitHub** | Clone, parse, review, confirm. Nothing is written until the last step. See [[Installing A Capability From GitHub]]. |
| **+ Define agent** | Meant to create an agent here — a prompt, a default model and effort, and an allowed-tools list (field guide). In the mockup it only selects `architect` and switches the kind filter to Agents; no form is designed. See [[Agent Capabilities]]. |

## In the rail

| Control | What it does |
|---|---|
| **Kind filter** | Narrows to skills, agents or packs. The count on each chip is how many are installed. |
| **Provider filter** | Narrows to capabilities packaged for one agent CLI — the fastest way to see what survives a provider switch. |
| **Search** | Matches name, author and description together. Type an author to see everything they published. |
| **A row** | Opens it in the detail pane. |

## In the detail pane

| Control | What it does | Availability |
|---|---|---|
| **Update to n** | Replaces the installed pack with the newer commit. | Only when the source has moved. |
| **Open on GitHub** | The source repository, at the installed commit. | Only when the capability has a source (not locally defined agents). |
| **Remove** | Deletes it from the capability store. The mockup deletes on the first click; the PRD and backlog want a confirm. | **Disabled while any step references it**, with the count shown beside the button. |

## In the install dialog

| Control | What it does |
|---|---|
| **URL field + Fetch** | Starts clone → parse → check. Read-only once started. |
| **Install `<id>`** | Writes the capability to the library. Only shown at the ready stage. |
| **Close** / backdrop / `esc` | Abandons the install. Nothing is written. |

## Keyboard

| Key | Action |
|---|---|
| `esc` | Close the install dialog |

The field guide's walkthrough also takes `←` / `→` to step through it.

## Related

- [[Capability Library Screen]]
- [[Updating And Removing Capabilities]]
