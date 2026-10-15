---
tags: [flowboard, sandboxing, sources]
module: Sandboxing
---

# Sandboxing Sources

Every fact in these notes comes from the files below (paths relative to the repo root). Checked on 2026-10-15 against branch `dev` at `49c7d97`, with a clean working tree.

## Primary

| File | What it contributes |
|---|---|
| `docs/old/architecture/08-sandboxing.md` | The whole design: threat model, isolation ladder, security profile, `ExecHost` seam, gate, HITL and memory in a sandbox, prior art, recommendation, external sources |
| `docs/old/reference/core/ports/exec-host.ts` | `IsolationTier`, `SandboxProfile`, `ChildHandle`, `ExecHost`, with field comments |
| `docs/old/PRD.MD` §11.1 | Sandboxed execution: mounts, security profile, egress proxy, no real credential, the gate, `sandbox_profile`, `runs.sandbox`, Docker probe, git plugins on the host tier |
| `docs/feature-map.md` §10 | The plain-English feature list and the ❓ on default strength and HITL |
| `docs/flowboard-ideation.drawio` | *Harness architecture*: Docker Desktop VM, agent sandbox and image, mounts, hardening, hooks, tiers, check container, egress proxy, `fb-sandbox`, permission gate, workspace manager, runner, SQLite card (`runs … sandbox`, `settings … sandbox_profile`), *Dual encoding* concept, *Life of one step* E–I. *Logical components*: container workspace adapter (dashed). *Functional components*: *Isolate the workspace*. *FlowBoard ideation*: D5 hook isolation, scope card, Workspace adapters, memory host-side broker |
| `docs/old/REBUILD-BACKLOG.md` | Story 3.5 (the sandbox story), 0.1 (Docker probe, hook isolation), 0.2 (fake `claude`), 1.1 (schema), 1.2 (researcher template out), 3.3, 3.4, 8.3, 10.2; D5, D7, D8, D9; *What went wrong* item 6 |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/PRD.MD` §0, §3, §5, §7, §9, §13, §14, §15, §16, §17 | Proxy probe; `exec/` adapters and port list; `permission_mode` default, `plugins.has_hooks`, `tasks.non_goals`, the missing columns; command line, hooks, sandboxed runs, shell steps; broker and socket; settings sandbox section; no milestone; `scout` and egress; memory acceptance item; scope notes |
| `docs/old/architecture/01-ports.md` | *ExecHost and sandboxing*, `Workspace.id`, the gate, `tool_hooks`, memory off the allowlist |
| `docs/old/architecture/03-execution-substrate.md` §5, §6 | Runner sandbox duties, limit mapping, two gates, credential via proxy, shell steps through the same `ExecHost`, memory host-side |
| `docs/old/architecture/04-hitl-and-notify.md` §9 | One broker path on every tier |
| `docs/old/architecture/05-environment-and-registry.md` §11 | Isolation ladder on the Workspace port |
| `docs/old/architecture/07-ports-in-practice.md` | `hostExecHost` in the worktree adapter; `containerWorkspace` |
| `docs/old/architecture/09-memory.md` | Memory brokered on the host; remote Mem0 exception; trust channel |
| `docs/old/architecture/README.md` | Port table, sandboxed execution summary, module layout, open decision 3 |
| `docs/old/reference/core/ports/workspace.ts` | `execHost(task)` on the Workspace port |
| `docs/old/reference/core/ports/agent-provider.ts` | `RunSpec.exec`, capability flags (no `tool_hooks`) |
| `docs/old/reference/core/ports/memory-store.ts` | Memory stays off the allowlist |
| `docs/feature-map.md` §14, §16, §19, *Across everything*, *Parking lot* | Workspaces link, team guardrails idea, sandbox defaults setting, safety theme, cloud runs and injection scan |
| `docs/mockups/flow-designer.html`, `flow-designer-guide.html` | `SANDBOX` values, default `sealed container`, the *unattended and unsandboxed* chip, the Sandbox and Budget rows |
| `docs/mockups/inbox.html`, `inbox-guide.html` | `billing-webhook` egress failure, **Allow host & retry** |
| `docs/mockups/monitor.html`, `monitor-guide.html` | Status-bar posture, row detail, failure actions, sample log line |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | `$0.48` egress failure, status-bar posture, task memory entry |
| `docs/mockups/capability-library.html`, `capability-library-guide.html` | *"does not open the wall"*, step-level egress |
| `docs/mockups/README.md` | Flow designer edits *"the sandbox level"* |

## Other vault notes relied on

- [[Run Guardrails At Launch]], [[Step Guardrails]] for the existing treatment of the gate and the mockup mapping proposal.
- [[Capability Library Decisions]] for D8, D9, D14, D15, D31.
- Open-question numbers cited from [[Execution Open Questions]], [[Flow Design Open Questions]], [[Monitor Open Questions]], [[Human In The Loop Open Questions]], [[Task Detail Open Questions]], [[Cost And Control Open Questions]].

## Related

- [[Sandboxing Index]]
- [[Sandboxing Prior Art]]
