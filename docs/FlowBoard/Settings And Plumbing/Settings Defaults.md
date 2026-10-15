---
tags: [flowboard, settings-and-plumbing, settings, defaults]
module: Settings And Plumbing
---

# Settings Defaults

The values a fresh install starts with, and the platform constants beside them. No source seeds the `settings` table. PRD §15 seeds a project, a flow, agents and skills, but no settings rows.

## Global settings

| Setting | Default | Source | Status |
|---|---|---|---|
| Draft mode | off | none | **Inferred.** A toggle *"for when I am iterating on the flow itself"* (PRD §13) implies off |
| Theme | light, dark, or system | PRD §13 dark-first; backlog 9.1 light; mockups light only | **Conflict** ([[Appearance And Theme]]) |
| Escalation threshold | 5 minutes | `04` §10, backlog 6.1, old handoff | Default as a setting. PRD §10 and the drawio fix 5 minutes with no setting; the mockups use 10 ([[Escalation Threshold]]) |
| Sandbox tier | `container` whenever the step bypasses permissions. `host` is allowed *"only for non-bypass steps or an explicit trusted-repo opt-out"*; no source names a default for those cases | `08` recommendation 1, backlog D7; drawio *Tiers* card: *"container (default when autonomous)"* | Recommendation, not a spec. **Conflict on whether the sandbox is on at all:** `docs/pitch.md` says on (*"FlowBoard makes the safe path the default: each step runs in a **sandbox**"*); `08` (*"Optional, off by default for trusted local repos"*) and PRD §11.1 (*"optional, recommended for headless runs"*) say optional. Every step defaults to `bypassPermissions` (PRD §5). [[Sandboxing Open Questions]] #3 |
| Sandbox image | `flowboard-runner` | drawio *Harness architecture* | Name only |
| Egress allowlist | model endpoint (via the proxy) + npm/pnpm; no git remote | `08` recommendation 2; drawio adds PyPI and *"api.openai.com (later)"* | Recommendation |
| Resource limits | none given | — | **Gap** |
| Memory adapter | `none` | PRD §11.2, §13; `06` §15 | Decided |
| Memory scopes | `user` first | `09` recommendation 2; architecture `README.md` open decision 4 | Recommendation; feature map §21 leaves it open ([[Memory Open Questions]] #3) |
| Recall limit | none given | — | **Gap** |
| `max_recall_chars` | 6,000 | PRD §7, `09` | Decided |

## Platform constants

Not settings, but defaults the plumbing depends on. See [[Environment And Configuration]].

| Constant | Value | Source |
|---|---|---|
| SQLite `busy_timeout` | 5000 ms | PRD §3, `02` §1, backlog 1.1, drawio |
| Journal mode | WAL | PRD §3, `02` §1, backlog 1.1, drawio |
| Foreign keys | on | `02` §1, backlog 1.1 |
| Stale-lease reclaim | 10 minutes | PRD §7, backlog 3.1 |
| Ask timeout before parking | 20 minutes | PRD §9 |
| Broker poll | every 2 seconds | PRD §9 |
| Infra retry backoff | 30 s, 2 min, 8 min | PRD §7 |
| `max_attempts` | 3 | PRD §4, §5 |
| Step model / effort | `sonnet` / `medium` | PRD §5 |
| Step `permission_mode` | `bypassPermissions` | PRD §5 |
| Dev server port | 3111 | backlog 0.3 |
| Concurrent runs (`VIBE_MAX_RUNS`) | not given | backlog 3.1 ([[Execution Open Questions]] #36) |

## Related

- [[Settings Catalogue]]
- [[Settings Data Model]]
- [[Environment And Configuration]]
- [[Settings And Plumbing Open Questions]]
