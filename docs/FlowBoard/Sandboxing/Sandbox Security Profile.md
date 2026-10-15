---
tags: [flowboard, sandboxing, concept, hardening]
module: Sandboxing
---

# Sandbox Security Profile

*"The knobs a container/microVM `ExecHost` applies. All are provider-independent — they wrap the process, not the CLI."* (`08-sandboxing.md` *The security profile*)

## Every knob

| Knob | Rule (source wording) | Source | Detail |
|---|---|---|---|
| Egress allowlist | *"Default-deny outbound; allow only the model/CLI endpoint and the package registries the step needs. **Not the git remote**"* | `08`, PRD §11.1 | [[Egress Allowlist]] |
| Non-root | *"Run as an unprivileged user; Claude Code even *rejects* `--dangerously-skip-permissions` when launched as root."* | `08` | `nonRoot?: boolean; // default true; bypassPermissions requires it` (`01-ports.md`) |
| Drop capabilities | *"`--cap-drop ALL`, add back only what a build needs."* | `08` | |
| No privilege escalation | *"`--security-opt no-new-privileges`; a `seccomp` profile."* | `08` | Backlog 3.5: *"seccomp default"* |
| Read-only root | *"Read-only root filesystem + `tmpfs` scratch; the only writable bind-mount is the task worktree."* | `08` | drawio: *"read-only root + tmpfs /tmp"* |
| Minimal mounts | *"Mount only the worktree (and the declared artifact dir), plus the plugin dirs the step names, read-only"* | `08` | [[Sandbox Mounts]] |
| Resource limits | *"`--memory`, `--cpus`, `--pids-limit`, and a wall-clock timeout"* | `08`, PRD §11.1 | [[Resource Limits]] |
| No real credential | *"The CLI gets `ANTHROPIC_BASE_URL` pointing at the egress proxy and a dummy key"* | `08`, PRD §11.1 | [[Credential Injecting Proxy]] |
| In-agent hooks | *"`PreToolUse` hooks (per-run `--settings`) deny writes outside the worktree, non-goal paths and destructive git/shell commands."* | `08`, PRD §7 | [[In-Agent Hooks]] |
| Ephemeral | *"One container per run/attempt, destroyed on completion — clean state, no cross-run contamination."* | `08` | [[Sandboxed Run Lifecycle]] |

The drawio *Hardening* card condenses it: *"non-root user · --cap-drop ALL · no-new-privileges · read-only root + tmpfs /tmp · --memory / --cpus / --pids-limit · wall-clock kill · no real credential inside"*.

## As a `docker run` (illustration)

> [!example] Proposal, not a source
> No source writes the full command. Assembled from the flags the sources name, a container run would look roughly like this:
> ```text
> docker run --rm \
>   --user <non-root> --cap-drop ALL --security-opt no-new-privileges \
>   --read-only --tmpfs /tmp \
>   --memory <m> --cpus <c> --pids-limit <p> \
>   --network fb-sandbox \
>   -v <worktree>:/work -v <plugin dir>:<target>:ro -v data/sock/<run_id>.sock:/run/fb/ask.sock \
>   -e ANTHROPIC_BASE_URL=<proxy> -e ANTHROPIC_API_KEY=<dummy> \
>   flowboard-runner claude -p …
> ```
> `--rm`, the env var name for the dummy key, and the plugin mount target are assumptions. Listed in [[Sandboxing Open Questions]].

## Where it lives in code

`SandboxProfile` in `exec-host.ts` carries `tier`, `image`, `egressAllow`, `limits`, `mounts`, `env` and `nonRoot`. Capability drops, seccomp, read-only root and `no-new-privileges` are **not fields**: they are fixed behaviour of the container `ExecHost`. See [[Sandboxing Data Model]].

## Which tiers apply it

The profile applies to `container`, `gvisor` and `microvm`. *"Absent for the `host` tier; present for sandboxed tiers."* (`exec-host.ts`, on `ExecHost.profile`). The `host` tier has none of these protections; only the [[In-Agent Hooks]] still apply there.

## Related

- [[Isolation Tiers]]
- [[ExecHost Port]]
- [[Sandbox Threat Model]]
- [[Sandboxing Prior Art]]
