---
tags: [flowboard, capability-library, skill]
module: Capability Library
---

# Skill Capabilities

A **skill** is a packaged instruction that a step invokes like a slash command. In a step definition it is `kind='skill'` with a `skill_id`.

## Claude packaging

The Claude pack of a skill is a **plugin directory**:

```
<slug>/
  .claude-plugin/plugin.json
  skills/<slug>/SKILL.md
```

It is mounted with `--plugin-dir <dir>` and invoked as `/<slug>`. The rebuild backlog records a hard lesson here: **`--add-dir` does not register skills; `--plugin-dir` does** (backlog FIX item, "Environment leaks"). Install adds `.claude-plugin/plugin.json` when a repository lacks one.

## The SKILL.md manifest

Frontmatter fields seen across the mockup and PRD:

| Field | Meaning | Example |
|---|---|---|
| `name` | Slug; also the slash command | `code-review` |
| `version` | Upstream version | `1.0.2` |
| `description` | One line, read by install | `Review a diff against the plan it came from.` |
| `invokes` | FlowBoard MCP tool the skill must call | `set_outcome`, `ask_user_batch` |
| `honours` | Protocol signal the skill respects | `no_answer_yet` |
| `produces` | Artifact the skill writes | `plan.md`, `threats.md`, `domain.md` |
| `allowed-tools` | Tools the skill may use | `Read, Grep` |

Example, as the mockup renders it:

```yaml
name: dependency-audit
version: 1.0.2
description: Audit dependencies for advisories and unpinned versions.
invokes: set_outcome
allowed-tools: Read, Bash, WebFetch
```

> [!note] `invokes` and `honours` tie skills to the harness
> `set_outcome` is how a review-style skill reports a verdict. `ask_user_batch` is how a questioning skill sends its whole question set to the inbox at once. `no_answer_yet` lets the run park instead of hanging. These are why the seeded skills double as test fixtures for the question loop and the flow engine.

## How a step uses a skill

In the run's prompt, slot 4 of the prompt builder is the slash invocation (`/grill-me`). The step's `prompt_template` follows in slot 5. See [[Capability Runtime Mounting]].

## Detail pane

- **SKILL.md** — the manifest, syntax-highlighted; network tools in amber
- **invoked as** — `/code-review`
- **format** — `Claude plugin dir — .claude-plugin/plugin.json + skills/<slug>/SKILL.md`
- **tools it may use**, **source** (repository + commit), **used by**

## Example skills in the mockup

| Skill | Author | Providers | Tools | Purpose |
|---|---|---|---|---|
| `code-review` | @flowboard/core | claude 2.1, codex 0.4 | Read, Grep | Read the diff against the plan, call `set_outcome` with a verdict |
| `grill-me` | @flowboard/core | claude 1.4 | Read | Batch questions, honour `no_answer_yet` |
| `plan-implementation` | @flowboard/core | claude 3.0, codex 1.1 | Read, Write | Research brief → numbered work items with acceptance criteria |
| `secret-scan` | @team-sec | claude 1.3 (1.5 available) | Read, Grep | Sweep the diff for credentials |
| `threat-model` | @team-sec | claude 1.0 | Read, Grep | Trust boundaries and attacker gains |
| `domain-model` | @alex | claude 0.3 | Read, Write | Transcript → entities, events, invariants |
| `release-notes` | @growth | claude 0.9 | Read, Write | Merged summaries → release notes (used by nothing) |

## Related

- [[Capability Kinds]]
- [[Installing A Capability From GitHub]]
- [[Seeded Capabilities]]
- [[Capability Tools And Egress]]
