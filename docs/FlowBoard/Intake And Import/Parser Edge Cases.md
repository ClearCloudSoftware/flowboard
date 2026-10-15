---
tags: [flowboard, intake-and-import, behaviour, edge-cases, parser]
module: Intake And Import
---

# Parser Edge Cases

How the reference [[Markdown Task Source]] behaves on input the sources do not discuss. Every row was run against `docs/old/reference/adapters/source/markdown/markdown-source.ts` with Node 24.11. These are observations of the reference code, not stated rules; whether each one is intended is listed in [[Intake And Import Open Questions]].

| Input | Result | Why |
|---|---|---|
| Text before the first heading | dropped | *"ponytail: lines before the first heading are ignored (no ambiguous parent)"* (the one case the code comments on) |
| `# Title` (level 1) | not a task; before the first `##` it is dropped, after it it is body text | only `#{2,3}` opens a block |
| `#### Sub` (level 4) | becomes body text of the block above | same |
| `##NoSpace` | not a heading | the regex needs whitespace after the hashes |
| `### Acceptance criteria` under a task | a **separate task** keyed `acceptance-criteria` | `###` opens a block like `##` |
| Plain bullets (`- one`) under a heading | the heading is the task; the bullets are its body | only **bold** bullets make a category |
| A category block with prose and a plain bullet beside bold bullets | prose and the plain bullet are dropped | in a category block only bold bullets are read |
| An indented line under a bold bullet | dropped; the task has no body | only the text on the bullet's own line is kept |
| `* **Star** : x` | task `Star`, body `x` | `*` and `-` bullets both count; `:` is a separator |
| Two headings with the same title | `same`, then `same-2` | in-file de-dupe |
| Two titles with the same explicit id `{#k}` | `k`, then `b-2` (the slug of the second title, plus `-2`) | the de-dupe falls back to `slugify(title)` |
| `## Title {#Upper}` | title `Title {#Upper}`, key `title-upper` | `splitId` accepts only `[a-z0-9][a-z0-9-]*`; anything else stays in the title |
| `Ünïcode café` | key `n-code-caf` | `slugify` keeps `[a-z0-9]` only |
| `日本語` | key `""` (empty) | nothing survives `slugify` |
| YAML front matter with `id: foo` | ignored; the key is the heading slug | the reference has no front-matter reader |
| Empty content | `[]` | — |

## What follows on re-import

- **Order matters for repeated titles.** The `-2` suffix goes to whichever copy comes second, so reordering two same-titled tasks swaps their keys and therefore which existing task each updates.
- **Renaming makes a new task.** A changed title is a changed key unless an explicit id pins it. See [[Import Key]].
- **Deleted entries stay.** Nothing in the parser, the port or the upsert removes a task that left the file. See [[Idempotent Upsert]].

## Related

- [[Intake And Import Index]]
- [[Markdown Task Source]]
- [[Backlog File Shapes]]
- [[Import Key]]
- [[Intake And Import Open Questions]]
