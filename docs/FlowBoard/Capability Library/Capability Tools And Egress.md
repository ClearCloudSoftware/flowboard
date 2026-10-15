---
tags: [flowboard, capability-library, security, sandbox]
module: Capability Library
---

# Capability Tools And Egress

## Declared tools

Every capability declares the tools it may use — a skill in `allowed-tools` in its `SKILL.md`, an agent in its allowed-tools list. Most are local and unremarkable:

`Read` · `Grep` · `Write` · `Edit`

The ones that can reach outside the workspace are marked **amber**, because they interact with the sandbox:

`Bash` · `WebFetch` · `WebSearch`

In the mockup this set is `NET_TOOLS = {'WebFetch', 'WebSearch', 'Bash'}`.

**v1 also marks a plugin amber when it ships `.mcp.json` or `hooks/`** ([[Capability Library Decisions|D9]]). Plugin contents are mounted as-is (D8), and an MCP server's tool names are only known once it starts, so the tool list alone would miss a plugin that reaches the network that way. The check is a file-exists test at install time (`plugins.has_mcp`, `plugins.has_hooks`).

## Installing does not open the wall

> [!important]
> **Egress is default-deny at the step, not the capability.** A skill that asks for `WebFetch` still fails closed until the host it needs is on that **step's** allowlist.

So the amber chip is **not** a warning that something is unsafe. It is a note that *this capability will not work until someone also changes a step's allowlist* — and that you should know which host before you approve that change.

Wiring a network-capable capability is therefore a **two-part job**:

1. Install the capability and reference it from a step.
2. Add the host it needs to that step's egress allowlist.

## What it costs when you forget

The sibling mockups show the failure this prevents:

- **Task detail** — `$0.48` wasted on a build attempt the sandbox killed for reaching `registry.npmjs.org`, which was not on that step's allowlist.
- **Inbox** — *"Attempt 3 of 3 failed — egress denied"*: `api.stripe.com` was not on the step's allowlist; `$1.44` spent and thrown away. The card offers **Allow host & retry**, which adds the blocked host to the step's allowlist and re-queues the run.

## The sandbox it interacts with

From `old/architecture/08-sandboxing.md` and the harness-architecture diagram:

- **Egress allowlist is load-bearing.** Default-deny outbound; allow only the model/CLI endpoint and the package registries the step needs. **Not the git remote** — the host does all git work.
- Implemented as an egress proxy (Squid / tinyproxy) on an internal Docker network, which also injects the real API key on model requests.
- **Installed skills are mounted read-only** into the sandbox (`ro: skills/ → /skills`) — harness diagram. **v1 (D14), now also in `08-sandboxing.md`:** only the step's pinned plugin dirs, read-only. The only writable mount is the task worktree.
- **No sandbox, no git plugins.** On the host tier, a step whose plugins came from a git URL does not run (D15).
- A default-deny allowlist holds even when tool approval is bypassed.

## Tool enforcement depends on the provider

The `allowed_tools` capability flag means *tool allow/deny is enforced, not advisory*. Without it, tool policy becomes advisory / prompt-level. The runner always appends the ask-user tools (`mcp__vibe__*`) so a restrictive list cannot lock out human-in-the-loop.

A second layer sits inside the agent: PreToolUse **hooks** (PRD §7, `03-execution-substrate.md`) block writes outside the worktree, non-goal paths and destructive commands, and return the reason so the agent changes course. Hooks are a provider capability (`tool_hooks`): a provider without them relies on the sandbox alone, and the flow editor says so.

## Where amber shows

- Detail pane: **tools it may use**, with the explainer *"Amber tools can reach outside the workspace. Egress is default-deny, so a step using this still needs the host on its allowlist — installing the capability does not open the wall."*
- Install dialog: **tools it asks for**, with the callout *"It asks for WebFetch…"*
- `SKILL.md` view: the network tool in `allowed-tools` is highlighted amber

## Related

- [[Capability Library Decisions]]
- [[Installing A Capability From GitHub]]
- [[Capability Runtime Mounting]]
- [[Skill Capabilities]]
- [[Capability Library Open Questions]]
