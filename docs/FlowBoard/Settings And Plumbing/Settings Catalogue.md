---
tags: [flowboard, settings-and-plumbing, settings, concept]
module: Settings And Plumbing
---

# Settings Catalogue

Every global setting the sources name, what it controls, and who reads it. Feature map §19 lists four. PRD §11.1 and §13 make the sandbox profile a structured setting; `06` §15, PRD §11.2 and §13 do the same for the memory block (`06` §15 has no sandbox entry).

## The list

| Setting | What it does | Read by | Sources | Note |
|---|---|---|---|---|
| **Draft mode** | Forces every step onto the cheapest model and low effort | The runner, as a `RunSpec` transform | Feature map §7, §19; PRD §13, §16; `06` §15; backlog 3.2, 8.3 | [[Draft Mode Setting]] |
| **Sandbox defaults** (`sandbox_profile`) | Default isolation tier, container image, egress allowlist, resource limits | The runner, through the `ExecHost` | Feature map §19; PRD §11.1, §13; backlog 1.1, 3.5; `08` | [[Sandbox Profile Setting]] |
| **Appearance** (theme) | Light, dark, or follow the system | The web UI | Feature map §19; `06` §15; backlog 8.3, 9.1 | [[Appearance And Theme]] |
| **Nudge timing** (escalation threshold) | How long a question waits before it is posted to chat | The `escalate_question` job | Feature map §19; `04` §10; `06` §15; backlog 6.1, 8.3 | [[Nudge Timing Setting]] |
| **Memory** block | Adapter, endpoint or key ref, enabled scopes, recall limit, `max_recall_chars` | The runner (recall before a run, commit after) | PRD §7, §11.2, §13; `06` §15; `09` | [[Memory Settings Block]] |

Feature map §19's own wording, verbatim:

> - **Draft mode** — Force everything onto cheap, fast AI while you iterate on recipes.
> - **Sandbox defaults** — How locked-down agents should run by default (see Sandboxing).
> - **Appearance** — Light, dark, or follow the system.
> - **Nudge timing** — How long a question waits before it escalates to chat.

`06` §15's list of what the `settings` table holds: *"draft mode, escalation threshold (minutes), theme (light/dark/system), and a **memory** block ([09](./09-memory.md)) — adapter id (`mem0`/`local`/`none`), endpoint or key ref, enabled scopes, recall limit. Off (`none`) by default; memory is additive."* It omits the sandbox profile, which PRD §11.1 adds: *"a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step"*.

> [!warning] The lists don't match
> | Setting | Feature map §19 | `06` §15 | PRD | Backlog 8.3 | Drawio SQLite card |
> |---|---|---|---|---|---|
> | Draft mode | ✓ | ✓ | §13 | ✓ | — (a toggle on the *Costs & settings* card) |
> | Sandbox | ✓ | — | §11.1, §13 | — (Story 1.1, 3.5) | ✓ |
> | Theme | ✓ | ✓ | — | ✓ | — |
> | Nudge timing | ✓ | ✓ | — (fixed 5 min in §10) | ✓ | — |
> | Memory | — | ✓ | §11.2, §13 | — | ✓ |
>
> The PRD never makes theme or the escalation threshold a setting. Feature map §19 leaves memory out, though §21 calls memory *"Off until you want it"*. The drawio *Harness architecture* SQLite card lists only *"settings (memory, sandbox_profile)"*. See [[Settings And Plumbing Open Questions]] #1.

## Global, not per project

All five are global. Feature map §19 calls them *"The global switches"*, and PRD §13 calls draft mode *"a global **draft mode** toggle in settings"*. Two settings have narrower layers on top:

- **Sandbox profile** is *"overridable per step"* (PRD §11.1), via *"an optional `step_defs.sandbox_profile` override"* (backlog 1.1).
- **Memory scopes** narrow recall per run: *"Recall the `user` scope into every run; `project`/`agent`/`task` per step"* (`09`, recommendation 2).

Feature map §1 calls Projects *"Your codebases and the settings for how agents work on each one"*. The only per-project values in the schema (`default_flow_id`, `check_command`, PRD §5) are project fields, not rows in `settings`; see [[Projects Index]]. Whether any global setting should be overridable per project is [[Projects Open Questions]] #23.

## Settings that are not in the settings table

Several tunables in the sources are environment variables or constants, not rows in `settings`. See [[Environment And Configuration]].

| Tunable | Where it lives | Source |
|---|---|---|
| Concurrent runs | `VIBE_MAX_RUNS` env | backlog 3.1, `03` §7 |
| Ask timeout (20 min) | constant; `VIBE_ASK_TIMEOUT_MS` overrides it for tests | PRD §9, backlog 4.1 |
| Slack credentials and channel | `.env.local` | PRD §10 |
| Stale-lease reclaim (10 min) | constant | PRD §7, backlog 3.1 |
| Infra retry backoff (30 s, 2 min, 8 min) | constant | PRD §7 |

`max_recall_chars` (default 6,000) is the opposite case: it looks like a tuning constant but lives inside the memory block, `settings.memory.max_recall_chars` (PRD §7). See [[Memory Settings Block]].

## Related

- [[Settings Data Model]]
- [[Settings Defaults]]
- [[Settings Overrides And Spec Transforms]]
- [[Settings Surfaces]]
- [[Settings And Plumbing Index]]
