---
tags: [flowboard, settings-and-plumbing, settings, ui]
module: Settings And Plumbing
---

# Settings Surfaces

Where the user sees and changes settings. There is **no settings mockup** and no field guide, so this is not a screen note. It collects what the sources say about where the controls live.

## What the PRD asks for

PRD §13 describes three settings sections, in prose, attached to the `/costs` paragraph:

- *"Add a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`"*
- *"Add a **sandbox** section in settings too: the default isolation tier (host / container / microVM), the container image, the network egress allowlist, and the resource limits."*
- *"Add a **memory** section in settings as well (§11.2): the adapter …, its endpoint or key ref, which scopes are enabled …, and the recall limit."*

PRD §13's route list (`/`, `/p/[slug]`, `/inbox`, `/runs/[id]`, `/p/[slug]/flow`, `/p/[slug]/library`, `/costs`) has **no settings route**.

## Where other sources put it

| Source | Placement |
|---|---|
| drawio *FlowBoard ideation* | A *"Costs & settings /costs"* card holding the *"Draft mode toggle"* |
| drawio *Logical components* | *"Costs /costs rollups and draft-mode toggle"* |
| drawio *Harness architecture* | Front-end card *"Library · Costs · Settings / skills & agents, spend + wasted spend, draft mode, sandbox tier"* |
| `flow-designer.html` | A *draft mode* toggle in the designer topbar, the only rendered settings control. Each step also has a **Sandbox** select (`none`, `container`, `sealed container`): a per-step override, not the global setting |
| Old design prototype | *"Escalation threshold is a setting (default 5 minutes); the prototype exposes it as a tweak"* (handoff README) |
| Backlog 8.3 | *"Draft mode toggle; theme light/dark/system …; escalation threshold in minutes"*. No route given |
| Backlog 9.2 | The chrome: *"Wordmark, nav pills, amber inbox count, running dot + spend today"*. No settings entry |

> [!example] Proposal — not in any source
> A `/settings` page with five sections in feature-map order: Draft mode, Sandbox, Appearance, Nudge timing, Memory. Every other surface that shows a setting (the designer's draft toggle, a draft badge in the chrome) reads and writes the same global value through `PATCH /api/settings`. Listed in [[Settings And Plumbing Open Questions]] #3.

## Showing that a setting is on

Only the flow designer shows draft mode's effect: *"draft mode — every step forced to haiku"* in the canvas bar. No source says whether the board, monitor or run viewer show that draft mode is on ([[Cost And Control Open Questions]] #5).

The monitor and task-detail status bars do show a sandbox posture, *"sandbox **container**, egress **default-deny**"*, but always the same one. No source says what they show when the Docker probe falls back to `host` ([[Sandboxing Open Questions]] #35).

## Related

- [[Settings Catalogue]]
- [[Draft Mode Setting]]
- [[Settings And Plumbing API And Routes]]
- [[Costs Page]]
- [[Flow Design Controls]]
- [[Sandboxing In The UI]]
