---
tags: [flowboard, sandboxing, api]
module: Sandboxing
---

# Sandboxing API And Routes

> [!note] No sandbox endpoints in the sources
> PRD §12 lists the whole API surface. None of it is about the sandbox. There is no settings endpoint at all, though PRD §13 asks for a settings sandbox section ([[Settings And Plumbing Open Questions]] #2).

## What exists

| Route | Sandbox relevance | Source |
|---|---|---|
| `PUT /api/flows/:id` | *"creates a new version"*; would carry a per-step sandbox override if one exists | PRD §12 |
| `POST /api/step-instances/:id/retry` | The plain retry; the nearest thing to **Retry as-is** | PRD §12 |
| `GET /api/runs/:id` | Would expose `runs.sandbox` | PRD §12 |

## Proposals

> [!example] Proposals, not sources
> | Proposed route | Purpose | Why |
> |---|---|---|
> | `GET /api/settings/sandbox` · `PUT /api/settings/sandbox` | Read and edit the global `sandbox_profile` | PRD §13 asks for a settings sandbox section; *"editable in settings"* (`08`) |
> | `GET /api/sandbox/status` | Docker probe result and the effective default tier | The status bars show the posture; PRD §11.1 falls back to host without Docker |
> | `POST /api/step-instances/:id/allow-host` `{ host }` | **Allow host & retry**: add the host, then re-queue | Inbox and monitor mockups. [[Human In The Loop API And Routes]] also proposes an allow-host endpoint |
>
> All are listed in [[Sandboxing Open Questions]].

## Related

- [[Sandbox Configuration]]
- [[Egress Denials]]
- [[Execution API And Routes]]
- [[Human In The Loop API And Routes]]
