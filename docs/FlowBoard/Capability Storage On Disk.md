---
tags: [flowboard, capability-library, storage]
module: Capability Library
---

# Capability Storage On Disk

Installed capabilities are files on the host. The DB records metadata; the plugin directories are the source of truth for what gets mounted.

## Locations named in the sources

| Source | Location | Note |
|---|---|---|
| PRD §13 | `./skills/<slug>` | Clone or sparse-checkout target |
| Root `.gitignore` / backlog | `skills/_installed/` | Ignored; installed (non-seeded) skills |
| Backlog Story 1.2 | `skills/<slug>/.claude-plugin/plugin.json` + `skills/<slug>/skills/<slug>/SKILL.md` | Seeded skills as plugin dirs |
| Harness diagram | `skills/<slug>/SKILL.md` as plugin dirs · agent definitions | *Durable state · host filesystem* |
| Mockup status bar | `~/.flowboard/capabilities` | The "capability store" |

## Layout of one Claude skill pack

```
<slug>/
├── .claude-plugin/
│   └── plugin.json          # added by install when missing
└── skills/
    └── <slug>/
        └── SKILL.md         # frontmatter: name, description, allowed-tools, …
```

## Properties

- **Local-first.** Clone once; nothing is fetched at run time.
- **Read-only to agents.** Mounted `ro` at `/skills` in the sandbox.
- **Host does git.** GitHub is reached by `git clone` from the host, not from the sandbox.
- **Seeded skills are committed** in the repo so tests run without GitHub.

## Related

- [[Capability Runtime Mounting]]
- [[Installing A Capability From GitHub]]
- [[Capability Library Open Questions]]
