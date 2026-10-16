---
tags: [flowboard, intake-and-import, concept, identity]
module: Intake And Import
---

# Import Key

`tasks.import_key`: *"stable key for idempotent md import"* (PRD §5). It is the identity that lets a re-import find the task it made last time. The table enforces it: `UNIQUE (project_id, import_key)`.

> [!important] The rule
> *"**Never trust the agent's key** — it drifted between runs (`filter-list-by-status` vs `filter-the-list-by-status`) and that is what duplicated tasks."* — `05` §14
>
> *"Derive server‑side: front‑matter/inline `id` → else `slugify(title)` — never trust the agent's key (it drifted between runs). Agent output is normalised through the same function."* — backlog 7.3 (**BUG**)

## How it is derived

1. An explicit id, if the file gives one. The sources disagree on where it is written (front matter, inline, or `{#slug}`); see [[Backlog File Shapes]] and [[Intake And Import Open Questions]] #1.
2. Otherwise `slugify(title)`: lowercase, every run of non-`[a-z0-9]` characters becomes `-`, leading and trailing `-` trimmed (`markdown-source.ts`).
3. In the reference parser, a key already used in the same file gets `-2`, `-3` and so on.

The PRD's own wording is *"a slug of the heading"* (PRD §15). For shape B the title is the bold bullet text, not the heading.

## Who derives it

The server, for every adapter. `task-source.ts`: *"Every adapter must derive `import_key` itself and never trust an upstream/agent-supplied key"*. The `ParsedTask` comment: *"Server-derived, stable across runs — the idempotency key for upsert on (project_id, import_key)."*

The PRD gave the job to the agent: its `backlog-importer` *"produce[s] a JSON array of `{ import_key, … }`"* and *"Derive[s] `import_key` from front-matter `id` if present, otherwise a slug of the heading"* (PRD §15). The backlog and architecture reverse that. The agent may still return a key, but it is recomputed. See [[Backlog Importer Agent]].

## What it is not

- Not the task `id`. Tasks keep their own primary key (PRD §5). Mockup task ids such as `auth-refactor` and `pdf-import` look like slugs but no source ties them to `import_key`.
- Not set on hand-made tasks. PRD §5 leaves the column nullable, and nothing says [[Creating A Task]] fills it.
- Not a step `key` or a flow key (*"keys uniquified on import"*, `02` §2, is about flows).

## Consequences

From the derivation, not stated in a source:

- A title edit without an explicit id gives a new key, so the next import creates a new task and leaves the old one. PRD §16 asks that re-import *"picks up edits"*. See [[Intake And Import Open Questions]] #4.
- Non-ASCII letters are dropped: `Ünïcode café` → `n-code-caf`, `日本語` → empty string (run against the reference). See [[Parser Edge Cases]].

## Related

- [[Intake And Import Index]]
- [[Idempotent Upsert]]
- [[Markdown Task Source]]
- [[Backlog File Shapes]]
- [[Task Record]]
