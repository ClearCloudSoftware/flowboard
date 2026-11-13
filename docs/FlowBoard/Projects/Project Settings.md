---
tags: [flowboard, projects, settings]
module: Projects
---

# Project Settings

Which settings a project can set for itself, where each value comes from, and where it is stored. This note answers [[Projects Open Questions]] #16 (per-project trust) and #23 (which settings are per project). It was worked out with Alex on 2026-11-12, while the [[Creating A Project|new project wizard]] was being designed. Each part below is marked as built, decided or proposed.

> [!important] The one rule
> A value about **the code** is stored in the repo. A value about **trust, money or this machine** is stored in FlowBoard. A cloned repo must never be able to grant itself trust, network access or budget.

## What the sources say

The docs name five app-wide settings: draft mode, the sandbox profile, theme, the escalation wait (*nudge timing*) and memory (PRD §11.1, §11.2, §13; feature map §19). All five are global. The only narrower level is *"sandbox, overridable per step"*. No source has a project level between the two, so the project level below is this note's proposal, which Alex adopted.

## Precedence: app → project type → project → flow → step

The narrowest level that sets a value wins. Every setting shows where its value comes from (*app settings*, *Software type*, *this project*) and has an **override** switch. Turning override on starts from the inherited value, so nothing changes until it is edited.

- **App:** FlowBoard's own defaults, on `/settings`.
- **Project type:** the defaults one kind of work needs. This is how *"Software is sandboxed, Writing may not be"* works.
- **Project:** this codebase's overrides.
- **Flow and step:** what a recipe or one step sets, such as a flow's `budget_usd` or a step's `sandbox:`.

> [!check] Built, 2026-11-12
> The first three levels: `resolveSettings(app, type, overrides)` in `packages/cli/src/settings.ts`, shared by the wizard and the project page. The flow and step levels are still the flow's own keys, not yet merged into this order.

### What a type sets

| | Software | Writing (later) | Research (later) |
|---|---|---|---|
| Isolation | container | none (on the machine) | container |
| Internet from the sandbox | the AI service and package registries | the AI service only | the AI service and the open web (deferred: open-web egress has no design yet) |
| Flows | `delivery`, `review-loop` | its own | its own |
| Knowledge assets | Serena and graphify on, rebuilt on push | — | — |

Steps run without permission prompts by default, and that is allowed only inside a sandbox ([[Repository Trust And Sandboxing]]). So a project or type with no sandbox runs its steps either asking before each tool use or without shell tools, and the settings page says so.

## The settings a project has

| Setting | What the sources say | Stored in | Status |
|---|---|---|---|
| **Repo trust**, which picks the isolation tier: *Trusted* (on the machine), *Normal* (container), *Untrusted* (gVisor) | Backlog D7/D8: *"host only with an explicit trusted-repo opt-out"*, *"gVisor/microVM opt-in per untrusted repo"*. Where the opt-out lives is [[Sandboxing Open Questions]] #5. | Project record | Stored; run-flow does not act on it yet. gVisor needs a Linux host; on macOS the tier falls back to a container, with a warning. |
| **Budget**: dollars a month, an alert percentage, and on reaching it either *pause new runs* or *ask me* | Nothing per project. Budgets exist per step (`max_budget_usd`), per flow (`budget_usd`, built), as a global-cap idea and as a team idea (*"a monthly cap; alert its lead as it fills"*). | Project record | Stored; enforcement across every run in the repo waits for its phase. The analysis agent's cost counts toward it. |
| **Network hosts** the sandbox may reach beyond the AI service (npm, PyPI, crates.io) | The allowlist is *"the model endpoint and the package registries a build needs"* ([[Egress Allowlist]]), so it depends on the repo. | Project record, never the repo: a repo file that widens network access is a route out for its code. | Decided, not built. The analysis agent proposes the hosts after cloning, and you accept or defer each. |
| **Resource limits** (memory, CPUs) | — | The repo's `.flowboard.yaml` | Built ([[Run Flow Reference#Project file]]). |
| **Check command** | `projects.check_command` | The repo's `.flowboard.yaml` | Built. The analysis agent proposes it after cloning; the wizard doesn't ask for it ([[Project Check Command]]). |
| **Escalation**: Slack channel and minutes before a question goes there | The data model records a channel per question (`questions.slack_channel`), so a channel per project fits. PRD §10 fixes the wait at 5 minutes; elsewhere it's a setting. | Project record | Stored; no notifier yet. |
| **Memory**: whether to remember facts about this codebase (the `project` scope) | *"Recall `user` into every run; `project` … per step"*. The adapter and endpoint stay app-wide. | Project record | Stored; no memory store yet. |
| **Knowledge assets**: Serena, graphify, and when to rebuild (on push, daily, by hand) | No source; Alex's direction. Serena is free; graphify sends code to the AI service and costs money, so it carries a standing warning. | Project record; the builds go in `.flowboard/knowledge/`. | Stored; builds wait for their phase. |
| **Draft mode**: the cheapest model for every step | A global setting (PRD §11.1). | Project record | Stored; not acted on. Useful for keeping a scratch project cheap. |
| **Base branch** | — | Not a setting | Follows GitHub's default branch. |

## App settings a project does not override

| App setting | Why not |
|---|---|
| Theme | It's about the app, not the code. |
| Memory adapter and endpoint, Slack credentials | They're about this machine and its accounts. |
| The GitHub connection | It's the installed `gh` login (Connections). |
| The projects folder | It's where new clones go, chosen per clone in the wizard. |
| Platform constants | They're not choices. |

**Maybe later:** a per-project cap on concurrent runs (`VIBE_MAX_RUNS`), so one project can't take every worker slot.

**Later:** *team guardrails* (feature map §16, *"rules nobody can quietly lift"*) would lock an app setting so no project can override it. Not for v1, given PRD §2.

## Where each value is stored

- **About the code** (resource limits, the check command): the repo's `.flowboard.yaml`, so it travels with the code. Its schema has no key for trust, network or budget.
- **About your judgement, money or this machine** (trust, budget, network hosts, escalation, memory, knowledge, draft mode): the project record's `overrides` in `projects.json`. A key that is present is overridden ([[Project Record]]).

## Related

- [[Projects Open Questions]]: #16 and #23, which this note answers
- [[Repository Trust And Sandboxing]]: how trust picks an isolation tier
- [[Settings Catalogue]]: the app-wide settings
- [[Settings And Plumbing Open Questions]]: #1, which settings exist
- [[Egress Allowlist]]: the hosts a sandbox may reach
- [[Project Record]]: the record that holds the overrides
- [[Project Check Command]]: the repo's check command
- [[Creating A Project]]: the wizard's Settings step
