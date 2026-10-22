---
tags: [flowboard, capability-library, glossary]
module: Capability Library
---

# Capability Library Glossary

| Term | Meaning |
|---|---|
| **Capability** | The logical building block a step names: `code-review`, `architect`, `Delivery pack`. Provider-independent. |
| **Provider pack** | One packaging of a capability for one agent CLI — the `CapabilityPack` record. A Claude plugin dir is the Claude pack. |
| **Bundle pack** | The third *kind* of capability: skills, agents and flows bundled and installed as one unit (`Delivery pack`, `Security pack`). Not the same thing as a provider pack. Deferred past v1 (D3). |
| **Plugin** | The v1 unit of install: one git repo cloned at one commit, mounted with `--plugin-dir`. Its skills are installed, updated and removed together (D4). |
| **Skill** | A packaged instruction, invoked like a slash command. Described by a `SKILL.md`. Belongs to a plugin and is invoked fully qualified: `/<plugin>:<slug>` (D16). |
| **Agent** | A named role: prompt, default model, default effort, allowed tools. |
| **Provider** | An agent CLI FlowBoard can drive. Built on 2026-10-18: `claude-code` and `opencode`, plus `replay`, a test double; `codex` is designed but not built (`ProviderId` is open, so others can be added). Whether OpenCode is in v1 is [[Agent Providers Open Questions]] #38. In the mockup each step names its provider; v1 has no provider column (D1). |
| **Adapter** | Provider-specific code behind the `AgentProvider` port. Knows how to mount packs. |
| **Registry** | The store of installed capabilities and their packs. |
| **Capability store** | The directory plugins are cloned into: `<project>/.flowboard/skills/<plugin>/<commit>/`, per project and gitignored (D5). The mockup showed `~/.flowboard/capabilities`. |
| **Extra plugins** | `step_defs.extra_plugin_ids`: plugins a step mounts beside its skill's, so its prompt template can invoke a second `/<plugin>:<slug>`. They count as uses (D14, D17). |
| **Staging** | `_staging/<uuid>/` in the store: the install preview's clone, kept until the install is confirmed or abandoned (D24). |
| **Capability pins** | What a task records at start: the commit of every plugin and a copy of every agent row it can use. Every step of the task runs those versions (D10). |
| **Seed** | A plugin or agent that ships in FlowBoard's repo and is copied into each project's store under FlowBoard's commit (D6). |
| **Manifest** | What install parses: `.claude-plugin/plugin.json` and `skills/*/SKILL.md` frontmatter. |
| **Used by** | The steps that reference a capability, counting each flow's latest version plus any version a non-terminal task pins (D17). The check that blocks removal. |
| **Orphan** | A capability nothing uses. Hollow dot in the rail. |
| **Network tool** | A tool that can reach outside the workspace: `WebFetch`, `WebSearch`, `Bash`. Marked amber, as are plugins that ship `.mcp.json` or `hooks/` (D9). |
| **Egress allowlist** | The hosts the sandbox lets a run reach. Default-deny. The mockups speak of *this step's* allowlist; PRD §11.1 keeps one in `settings.sandbox_profile`, overridable per step ([[Capability Library Open Questions]] #23). |
| **Logical model id** | A provider-neutral model name (`reasoning-high`, `fast-cheap`, `default`) that the adapter resolves to a native id (`reasoning-high` → `opus` / `o3`). In v1 the Claude aliases `opus`, `sonnet` and `haiku` serve as the logical ids (D20; PRD §5). The aliases are not native ids either: the CLI resolves them (see [[Logical Model Ids]]). |
| **Capability flag** | A provider feature in the `Capability` union (`plugins`, `allowed_tools`, `effort`, `tool_hooks`…). `tool_hooks` is in `01-ports.md` and, since 2026-10-18, in the shipped port (`core/src/ports/agent-provider.ts`), but not in the reference `agent-provider.ts` (`docs/old/reference/`); see [[Agent Providers Open Questions]] #1. Different from a library capability; used for capability negotiation. |

> [!warning] Two overloaded words
> - **"Pack"** means both a *provider pack* (packaging) and a *bundle pack* (a kind). The mockup's detail pane uses "packs — one packaging per provider" for the first, and the kind chip `pack` for the second.
> - **"Capability"** means both a *library capability* (this module) and a *provider capability flag* (`01-ports.md`, capability negotiation). These notes say "capability flag" for the second.

## Related

- [[Capability Library Decisions]]
- [[Capability Library Index]]
- [[Capability Versus Provider Pack]]
- [[Capability Kinds]]
- [[Agent Providers Glossary]]
