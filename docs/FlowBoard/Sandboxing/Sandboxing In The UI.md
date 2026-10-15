---
tags: [flowboard, sandboxing, ui]
module: Sandboxing
---

# Sandboxing In The UI

There is no sandboxing screen. The sandbox appears in five places in sibling mockups, and as one settings section in the PRD.

| Where | What shows | Source |
|---|---|---|
| Flow designer inspector | **Sandbox** select: `none` · `container` · `sealed container` | `flow-designer.html` |
| Flow designer inspector | Chip *"unattended and unsandboxed"* when no gate and sandbox `none` | `flow-designer.html` |
| Monitor status bar | *"sandbox **container**, egress **default-deny**"* | `monitor.html` |
| Monitor row detail | *"Sandbox · container · default-deny egress"* | `monitor.html` |
| Task detail status bar | *"sandbox **container**, egress **default-deny**"* | `task-detail.html` |
| Inbox and monitor *Needs you* | Failure card with **Allow host & retry**, **Retry as-is**, **Open the log** | `inbox.html`, `monitor.html` |
| Task detail cost tab | Wasted `$0.48` note: *"The first build attempt was killed by the sandbox"* | `task-detail.html` |
| Capability library | Amber network tools and the *"does not open the wall"* explainer | `capability-library.html` |
| Settings (PRD only) | Default tier, image, egress allowlist, resource limits | PRD §13 |
| Flow editor (PRD only) | Says so when a provider lacks `tool_hooks` | PRD §7 |

## Flow designer

The inspector row: `<label for="f-sandbox">Sandbox</label>` with the `SANDBOX` options. The guide's step-settings table:

| Setting | What it is | What goes wrong |
|---|---|---|
| Sandbox | *"How locked down the run is: none, a container, or a sealed container with no network."* | *"**none** on an unattended step is an agent with your machine and your keys, reading untrusted content."* |

The guide's anatomy legend lists *"gate · sandbox"* among the step fields. The one warning: *"The inspector flags it rather than blocking it — but in the real product that's the combination the sandbox rule refuses outright."* See [[Permission Gate]] and [[Step Guardrails]].

## Status bars

Monitor guide: *"**Status bar.** Totals, and the sandbox posture everything is running under."* Task-detail guide: *"The one-line version, including the sandbox posture everything ran under."* Both are a single posture for everything; with per-step tiers that may not hold ([[Monitor Open Questions]] #25).

## Failure cards

See [[Egress Denials]] for the full wording and actions.

## Library

See [[Capability Tools And Egress]]: *"Amber tools can reach outside the workspace. Egress is default-deny, so a step using this still needs the host on its allowlist — installing the capability does not open the wall."*

## Not drawn anywhere

- The settings sandbox section (PRD §13).
- Any view of a step's egress allowlist. The mockups edit it (**Allow host & retry**) but never show it.
- A Docker-missing warning.
- `runs.sandbox` on a run.

## Related

- [[Flow Design Screen]]
- [[Monitor Screen]]
- [[Task Detail Screen]]
- [[Human In The Loop Screen]]
- [[Capability Library Screen]]
