---
tags: [flowboard, intake-and-import, concept, port]
module: Intake And Import
---

# TaskSource Port

The seam between "where tasks come from" and the rest of FlowBoard. Architecture component **#14, *Ingestion → TaskSource port*** (`05` §14).

> *"Ingestion. Markdown import today; the `backlog-importer` agent is the "messy file" adapter. All adapters normalize through one **server-derived** `import_key` (`frontmatter.id` → else `slugify(title)`) — never trust an agent-derived key (the backlog's duplicate-import root cause)."* — `01-ports.md`

## The interface

Two sketches exist. The reference file is the runnable one.

`docs/old/reference/core/ports/task-source.ts`:

```ts
export interface ParsedTask {
  /** Server-derived, stable across runs — the idempotency key for upsert on (project_id, import_key). */
  import_key: string;
  title: string;
  body?: string;
}

export interface SourceInput {
  /** Inline content (browser paste / upload). */
  content?: string;
  /** Server-side file path. */
  path?: string;
}

export interface TaskSource {
  readonly id: string;
  fetch(input: SourceInput): Promise<ParsedTask[]>;
}
```

`docs/old/architecture/01-ports.md`:

```ts
interface TaskSource {
  id: 'markdown' | 'github' | 'linear' | 'webhook';
  fetch(input: SourceInput): Promise<Array<{ import_key: string; title: string; body?: string }>>;
}
```

| | `task-source.ts` | `01-ports.md` |
|---|---|---|
| `id` | `string` | `'markdown' \| 'github' \| 'linear' \| 'webhook'` |
| Return | `ParsedTask[]` | inline `{ import_key, title, body? }` array |
| `SourceInput` | defined: `content?`, `path?` | used, not defined |

Neither shape carries `acceptance_criteria` or `non_goals`, which the PRD's importer produces. See [[Intake And Import Open Questions]] #2.

## The contract every adapter keeps

From the doc comment in `task-source.ts`:

> *"TaskSource — ingestion behind one port. Markdown import today; GitHub Issues, Linear, and webhooks are other adapters. Every adapter must derive `import_key` itself and never trust an upstream/agent-supplied key — an unstable key is what duplicated tasks across runs (backlog Story 7.3)."*

And the acceptance test for the port (`01-ports.md`, `05` §14): *"Idempotent upsert on `(project_id, import_key)`: re-import twice = 0 created, N updated."*

The port only **parses**. Writing rows is the caller's job: in `07-ports-in-practice.md` the upsert loop sits outside `fetch()`. See [[Idempotent Upsert]].

## Adapters

| Adapter | Status | Source |
|---|---|---|
| `markdown` ([[Markdown Task Source]]) | v1, runnable reference | `markdown-source.ts`, `07` |
| `backlog-importer` agent ([[Backlog Importer Agent]]) | v1, *"the "messy file" adapter"* | `01-ports.md`, `05` §14 |
| GitHub Issues | later | architecture README, `05` §14, drawio |
| Linear | later | architecture README, `05` §14, feature map §17, drawio |
| Jira | later | architecture README, `05` §14, drawio *FlowBoard ideation* |
| webhook | later | architecture README, `05` §14, feature map §17 |

The drawio *Logical components* page draws one adapter box, **Markdown / Issues import**, wired to the **TaskSource** port in both directions, and an edge from TaskSource to **Task & run state** labelled *"import tasks"*. The *FlowBoard ideation* page: *"TaskSource adapters / GitHub Issues, Linear, Jira, webhook, beyond markdown import."* See [[Future Task Sources]].

## Where it lives

- PRD §3: `packages/core/ports/` holds *"AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource interfaces"*. The PRD's `adapters/` list has no `source/` folder.
- Architecture README module layout: `core/ports/` for the interface, `adapters/source/markdown/  github/` for the adapters.
- Dependency rule (architecture README): *"`core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule."*

See [[Intake Runtime]].

## Related

- [[Intake And Import Index]]
- [[Markdown Task Source]]
- [[Backlog Importer Agent]]
- [[Import Key]]
- [[Future Task Sources]]
- [[Notifier Port]]: the sibling port in the same family
