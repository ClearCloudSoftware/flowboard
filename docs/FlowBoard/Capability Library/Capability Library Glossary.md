---
tags: [flowboard, capability-library, glossary]
module: Capability Library
---

# Capability Library Glossary

| Term | Meaning |
|---|---|
| **Capability** | The logical building block a step names: `code-review`, `architect`, `Delivery pack`. Provider-independent. |
| **Provider pack** | One packaging of a capability for one agent CLI — the `CapabilityPack` record. A Claude plugin dir is the Claude pack. |
| **Bundle pack** | The third *kind* of capability: skills, agents and flows bundled and installed as one unit (`Delivery pack`, `Security pack`). Not the same thing as a provider pack. |
| **Skill** | A packaged instruction, invoked like a slash command (`/code-review`). Described by a `SKILL.md`. |
| **Agent** | A named role: prompt, default model, default effort, allowed tools. |
| **Provider** | An agent CLI FlowBoard can drive: `claude-code`, `codex`, `replay`. Each step names its provider. |
| **Adapter** | Provider-specific code behind the `AgentProvider` port. Knows how to mount packs. |
| **Registry** | The store of installed capabilities and their packs. |
| **Capability store** | The directory capabilities are cloned into. Shown in the mockup as `~/.flowboard/capabilities`. |
| **Manifest** | What install parses: `.claude-plugin/plugin.json` and `skills/*/SKILL.md` frontmatter. |
| **Seeded** | Ships with FlowBoard (`ships with FlowBoard`), authored by `@flowboard/core`. |
| **Used by** | The list of flow versions and steps that reference a capability. The check that blocks removal. |
| **Orphan** | A capability nothing uses. Hollow dot in the rail. |
| **Network tool** | A tool that can reach outside the workspace: `WebFetch`, `WebSearch`, `Bash`. Marked amber. |
| **Egress allowlist** | Per-step list of hosts the sandbox lets the agent reach. Default-deny. |
| **Logical model id** | A model name (`opus`, `reasoning-high`, `fast-cheap`) that the adapter resolves to a native id. |
| **Capability flag** | A provider feature in the `Capability` union (`plugins`, `allowed_tools`, `effort`…). Different from a library capability; used for capability negotiation. |

> [!warning] Two overloaded words
> - **"Pack"** means both a *provider pack* (packaging) and a *bundle pack* (a kind). The mockup's detail pane uses "packs — one packaging per provider" for the first, and the kind chip `pack` for the second.
> - **"Capability"** means both a *library capability* (this module) and a *provider capability flag* (`01-ports.md`, capability negotiation). These notes say "capability flag" for the second.

## Related

- [[Capability Library Index]]
- [[Capability Versus Provider Pack]]
- [[Capability Kinds]]
