---
tags: [flowboard, intake-and-import, concept, markdown]
module: Intake And Import
---

# Backlog File Shapes

What a backlog file can look like. Feature map §17: *"Paste or point at a markdown list and it becomes tasks, understanding both headings and bulleted lists."* The drawio *FlowBoard ideation* card: *"Markdown backlog import / Headings and bullets → tasks."*

The first build had *"two parsers with different task shapes (`##` headings vs bullets)"* (backlog, *What went wrong*, item 2). v3 has one parser for both.

## Shape A: heading per task

*"`##` heading = task"* (backlog 7.3, `05` §14). The reference also accepts `###`. The lines under the heading are the body.

```markdown
## Add OAuth login
Support Google + GitHub.

## Fix flaky test {#flaky-cart}
Retries needed.
```

→ `add-oauth-login` (body *"Support Google + GitHub."*), `flaky-cart` (body *"Retries needed."*). From the self-check in `markdown-source.ts`.

## Shape B: category heading with bold bullets

*"heading‑as‑category with `- **Title** … ` bullets = tasks"* (backlog 7.3). The heading is only a group; it does not become a task.

```markdown
## Backlog
- **Filter list by status** — add a dropdown
- **Export CSV**: from the table
```

→ `filter-list-by-status`, `export-csv`. Separators the reference accepts between title and body: `-`, `–`, `—`, `:`. A `*` bullet works as well as `-`.

## Sub-sections: acceptance criteria and non-goals

The PRD's importer reads two optional sub-sections: *"`{ import_key, title, body, acceptance_criteria?, non_goals? }` (the last two from "Acceptance criteria" / "Non-goals" sub-sections when present)"* (PRD §15).

No source shows what such a sub-section looks like. In the reference parser, a `### Acceptance criteria` heading starts a new block and becomes a separate task keyed `acceptance-criteria`. See [[Parser Edge Cases]] and [[Intake And Import Open Questions]] #2.

## Explicit ids

| Source | Form |
|---|---|
| PRD §15 | *"Derive `import_key` from front-matter `id` if present, otherwise a slug of the heading."* |
| backlog 7.3 | *"front‑matter/inline `id` → else `slugify(title)`"* |
| `05` §14 | *"`frontmatter/inline id` → else `slugify(title)`"* |
| `01-ports.md` | *"`frontmatter.id` → else `slugify(title)`"* |
| `markdown-source.ts` | *"explicit `{#slug}` wins, else slugify(title)"*, written at the end of the title |

See [[Import Key]].

## Messy files

Anything that fits neither shape is for the agent: *"The agent path exists for genuinely messy files only"* (`05` §14). No source defines *messy*. See [[Backlog Importer Agent]].

## Related

- [[Intake And Import Index]]
- [[Markdown Task Source]]
- [[Import Key]]
- [[Parser Edge Cases]]
- [[Task Record]]
