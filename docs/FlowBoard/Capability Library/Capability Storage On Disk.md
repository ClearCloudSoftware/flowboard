---
tags: [flowboard, capability-library]
module: Capability Library
---

# Capability Storage On Disk

Installed plugins are files on the host. The DB records metadata; the plugin directories are the source of truth for what gets mounted and for what `SKILL.md` says.

## v1 layout (decided)

```
<project>/.flowboard/skills/            # gitignored, per project (D5)
├── _staging/<uuid>/                    # install preview; deleted on confirm or close (D24)
├── code-review/                        # a seed plugin
│   └── <flowboard-sha>/                # seeds are filed under FlowBoard's commit (D6)
└── fb-dependency-audit/                # a git-installed plugin
    ├── b62f10d…/                       # installed commit
    └── 9c41e07…/                       # older commit, kept while a live task pins it (D10, D11)
```

- **Per project, not per user.** Flows are already scoped by project (`flows.project_id` in the PRD), so the capabilities they draw on are too.
- **Gitignored.** Not committed, so no writable copy of a skill ever lands in a task worktree, and clones stay out of the project's history. PRD §13 says *"gitignored"*; backlog Story 0.3 names the mechanism: FlowBoard adds `.flowboard/skills/` to the managed repo's `.git/info/exclude`, so nothing is written to the project's own `.gitignore`. See [[Parent Repo Hygiene]].
- **One directory per commit.** This is what lets a task keep running the commit it started with after an update.
- **Seeds are copied in** from FlowBoard's own repo on project registration and on FlowBoard upgrade; an upgrade stages a new `<flowboard-sha>/` dir as *update available* (D12).
- **Garbage collection** deletes a commit dir once it is neither the installed commit nor pinned by a non-terminal task (D11).

## Layout of one Claude plugin

```
<commit>/
├── .claude-plugin/
│   └── plugin.json          # added by install when missing
├── skills/
│   └── <slug>/
│       └── SKILL.md         # frontmatter: name, description, allowed-tools, …
├── hooks/                   # optional — mounted as-is, marks the plugin amber (D8, D9)
└── .mcp.json                # optional — mounted as-is, marks the plugin amber
```

## Locations named in the sources (superseded)

| Source | Location | Note |
|---|---|---|
| PRD §13 (earlier draft), drawio *FlowBoard ideation* | `./skills/<slug>` | Clone or sparse-checkout target (*"Clone / sparse-checkout into ./skills/<slug>"*, drawio); the PRD now uses the v1 layout |
| PRD §15 | FlowBoard's `./skills/` | Seeds as *"real local plugin dirs under FlowBoard's `./skills/` with a `SKILL.md` each"* — where seeds live in FlowBoard's repo (the first draft said *"real local skill directories"*) |
| Root `.gitignore` / backlog Story 0.3 (earlier drafts) | `skills/_installed/` | Ignored, never used; the rule was removed on 2026-10-15 |
| Backlog Story 0.3 | `.flowboard/skills/` in each managed repo's `.git/info/exclude` | How the store stays out of git |
| Backlog Story 1.2 | `skills/<slug>/.claude-plugin/plugin.json` + `skills/<slug>/skills/<slug>/SKILL.md` | Seeded skills as plugin dirs — the source the seeds are copied from |
| Harness diagram | `skills/<slug>/SKILL.md` as plugin dirs · agent definitions | *Durable state · host filesystem* |
| Mockup status bar | `~/.flowboard/capabilities` | The "capability store" |

## Properties

- **Local-first.** Clone once; nothing is fetched at run time.
- **Read-only to agents.** Only the step's plugin commit dirs are mounted, read-only, into the task's container (D14).
- **Host does git.** Any git URL — GitHub or `file://` — is cloned from the host, not from the sandbox (D7).
- **Seeds are committed in FlowBoard's repo** so tests run without network access.

## Related

- [[Capability Library Decisions]]
- [[Capability Runtime Mounting]]
- [[Installing A Capability From GitHub]]
- [[Projects Storage]]
- [[Parent Repo Hygiene]]
