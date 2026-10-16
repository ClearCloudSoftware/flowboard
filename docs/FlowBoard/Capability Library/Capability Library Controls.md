---
tags: [flowboard, capability-library, ui, reference]
module: Capability Library
---

# Capability Library Controls

Every control on the [[Capability Library Screen]].

## In the topbar

| Control | What it does |
|---|---|
| **+ Install from git** | Clone any git URL (GitHub or `file://`), parse, review, confirm. Nothing is written until the last step. The mockup labels it *Install from GitHub*; **+ Install from git** is proposed wording ([[Capability Library Open Questions]] #25). See [[Installing A Capability From GitHub]]. |
| **+ Define agent** | Opens a form: name, description, prompt, default model, default effort, allowed tools ([[Capability Library Decisions|D21]]). In the mockup it only selects `architect` and switches the kind filter to Agents. See [[Agent Capabilities]]. |
| **Check for updates** | v1. Checks every git-sourced plugin in the project against its remote. The only way updates are found (D13). |

## In the rail

| Control | What it does |
|---|---|
| **Kind filter** | Narrows to skills or agents (packs deferred, D3). The count on each chip is how many are installed. |
| **Provider filter** | Narrows to capabilities packaged for one agent CLI. *Not in v1* (D1). |
| **Search** | Matches name, author and description together. Type an author to see everything they published. In v1 a plugin's author is not stored (`plugins` has no author column, PRD §5): [[Capability Library Open Questions]] #26. |
| **A row** | Opens it in the detail pane. |

## In the detail pane

| Control | What it does | Availability |
|---|---|---|
| **Update to n** | Opens a preview — the note, skills added and removed — then moves the plugin to the newer commit. Refused if it drops a skill in use (D19). Running tasks keep their pinned commit (D10). | Only when **Check for updates** found a newer commit. |
| **Open on GitHub** | The source repository, at the installed commit. | Mockup: whenever the record has a source, seeds included; never for agents. v1 *(proposal, [[Capability Library Open Questions]] #25)*: only when the plugin has a remote web URL, so not seeds (`repo_url` is null) or `file://` sources. |
| **Duplicate to edit** | Copies a seeded agent into an editable one (D21). | Seeded agents. |
| **Remove** | Deletes the plugin — all its skills — or the agent, after a confirm (D18). The mockup deletes on the first click. | **Disabled while any step references it** (D17), with the count shown beside the button. |

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

- [[Capability Library Decisions]]
- [[Capability Library Screen]]
- [[Updating And Removing Capabilities]]
