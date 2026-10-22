---
tags: [flowboard, settings-and-plumbing, glossary]
module: Settings And Plumbing
---

# Settings And Plumbing Glossary

> [!warning] Overloaded words
> - **settings** — (1) FlowBoard's global `settings` table; (2) the per-run Claude Code `settings.json` passed with `--settings`, which carries PreToolUse hooks (PRD §7; as built none is written, and the hook is an in-memory callback, see [[Claude Code Adapter]]); (3) feature map §1's *"settings for how agents work on each one"*, meaning project fields; (4) the user's own `~/.claude` settings that headless runs must not inherit (backlog 0.1; as built, `settingSources: []` keeps them out). Here, unqualified, it means (1).
> - **draft** — draft mode (a setting) vs `draftAnswers` (the old handoff's unsent inbox answers).
> - **stream** — an SSE stream to the browser vs the CLI's `stream-json` output.
> - **profile** — `sandbox_profile` (a setting) vs `SandboxProfile` (the port type) vs a seccomp profile.
> - **transform** — a `SpecTransform` on a `RunSpec` vs `transform` as a proposed `StepExecutor` kind (`02` §3).
> - **core** — `packages/core` (PRD §3) vs `core/` (architecture layout); same idea, two paths.
> - **API** — FlowBoard's REST API vs the Anthropic API, which nothing may call directly (PRD §17).
> - **lib** — `src/lib/` (`06` §15) vs the capability **library** screen.

| Term | Meaning | Source |
|---|---|---|
| **Setting** | A global switch, stored as a row of `settings(key, value)` | feature map §19, PRD §5 |
| **Draft mode** | Forces every step to haiku / low effort while iterating on a flow | PRD §13 |
| **Spec transform** (`SpecTransform`) | A pure `RunSpec → RunSpec` function the runner applies before `launch()` | `06` §15 |
| **Resolved values** | The model, effort and tier a run actually used, after transforms; stored on the run | `06` §15, PRD §11.1 |
| **Sandbox profile** | Tier, image, egress allowlist and limits; global default, per-step override | PRD §11.1 |
| **Tier** | `host`, `container`, `gvisor`, `microvm` | `08`, `IsolationTier` |
| **Docker probe** | The startup check that falls back to `host` when Docker is missing | PRD §11.1 |
| **Memory block** | The memory section of settings: adapter, endpoint/key ref, scopes, recall limit, `max_recall_chars` | PRD §11.2 |
| **Key ref** | Named but not defined by the sources. **Inference:** presumably a pointer to a secret, stored instead of the secret. See [[Settings And Plumbing Open Questions]] #9 | PRD §11.2, `09` |
| **Nudge timing** | Feature-map name for the escalation threshold | feature map §19 |
| **Escalation threshold** | How long a question waits before it is posted to chat | `04` §10 |
| **Appearance / theme** | Light, dark or system | feature map §19 |
| **Plumbing** | *"The internal connections that let the screens talk to the data and stream live updates"* | feature map §20 |
| **Thin handler** | A route that validates with zod, calls one function, returns JSON | PRD §12, `06` §15 |
| **Three-liner** | `06` §15's name for a thin handler: *"validate → lib → JSON"* | `06` §15 |
| **zod** | The validation library every handler uses | PRD §12 |
| **Server action** | A Next.js server function the UI calls directly; PRD §3 lists them in `apps/web`, and the drawio uses one for Start, which PRD §12 has no route for (the first build added `/start` itself, backlog intro item 3) | PRD §3, drawio |
| **SSE** | Server-Sent Events, the one-way live transport | PRD §2 |
| **EventSource** | The browser API that consumes SSE | drawio |
| **Tail by `seq`** | Read new rows after the last sequence number seen | PRD §7 |
| **`Last-Event-ID`** | The SSE header a reconnecting client sends to resume | PRD §12 |
| **Snapshot stream** | The inbox's SSE stream of *"pending + answered in last 2 min"* questions, so Slack answers repaint the page | backlog 4.3, `04` §9 |
| **Lost the orchestrator** | The error state when the live connection drops | old handoff 1d |
| **`apps/web`** | The Next.js process: routes, server actions, SSE | PRD §3 |
| **`apps/worker`** | The Node process that runs jobs and agents | PRD §3 |
| **`apps/mcp-shim`** | The stdio MCP server that forwards `ask_user` calls to the broker. As built: `packages/ask-user`, a server named `flowboard`, whose broker runs inside `run-agent` ([[Ask User MCP Server]]) | PRD §3, §9 |
| **Dependency rule** | `packages/core` imports no framework, DB driver or CLI; core never imports adapters | PRD §3, architecture `README.md` |
| **Port / adapter** | An interface the core depends on / an implementation of it | architecture `README.md` |
| **WAL** | SQLite write-ahead logging, so readers and writers don't block | PRD §3 |
| **`busy_timeout`** | How long a SQLite write waits for the lock (5000 ms) | PRD §3 |
| **DB singleton** | One connection per process, cached on `globalThis` for hot reload | backlog 1.1 |
| **Migration** | A drizzle-kit schema change, applied on first open | PRD §2, backlog 1.1 |
| **Append-only journal** | Treating `runs` as never-mutated history | `02` §1 |
| **`VIBE_*`** | The first build's env var prefix (`VIBE_ROOT`, `VIBE_DB_PATH`, `VIBE_MAX_RUNS`, `VIBE_ASK_TIMEOUT_MS`) | backlog |

## Related

- [[Settings And Plumbing Index]]
- [[Settings And Plumbing Overview]]
- [[Settings Catalogue]]
