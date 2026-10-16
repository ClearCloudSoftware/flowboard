---
tags: [flowboard, sandboxing, testing]
module: Sandboxing
---

# Sandboxing Testing

## What the backlog asks for

Backlog Story 3.5: *"**Tests:** integration lane runs a step in a container against the fake `claude`; assert egress denied except allowlist, and that `bypassPermissions` is refused on the `host` tier."* Tagged **GAP**.

The fake `claude` comes from Story 0.2: *"an integration lane that spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend."*

| Check | Source |
|---|---|
| A step runs in a container | backlog 3.5 |
| Egress to a non-allowlisted host is denied | backlog 3.5 |
| Egress to an allowlisted host works | backlog 3.5 (*"denied except allowlist"*) |
| `bypassPermissions` refused on `host` | backlog 3.5 |
| The CLI works through the credential-injecting proxy | PRD §0 step 3 |
| Docker present or absent | backlog Story 0.1 probe |
| A sandboxed run needs no allowlist entry for memory | PRD §16 |

## Why the broker helps

*"So a host run and a sandboxed run behave identically, and there is one path to test."* (PRD §9). See [[Host-Side Brokers]].

## Not covered

The PRD §16 acceptance checklist has one sandbox-related item (memory host-side). Backlog Story 10.1 mirrors PRD §16 and has none. No source asks to test the hooks, the mounts, the resource limits or the non-root user. See [[Sandboxing Open Questions]].

## Related

- [[Execution Testing]]
- [[Permission Gate]]
- [[Egress Allowlist]]
