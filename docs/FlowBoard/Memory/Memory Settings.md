---
tags: [flowboard, memory, settings]
module: Memory
---

# Memory Settings

All memory configuration lives in one **memory block** in `settings`.

## Fields

| Field | Values | Default | Source |
|---|---|---|---|
| Adapter | `none` / `local` / self-hosted Mem0 / Mem0 cloud | `none` | PRD §13, §11.2 |
| Endpoint or key ref | *"self-host URL / cloud key ref"* (`09`); *"endpoint / key ref"* (PRD §11.2); *"endpoint or key ref"* (PRD §13) | — | `09`; PRD §11.2, §13 |
| Enabled scopes | user / project / agent / task | not stated | PRD §11.2, §13 |
| Recall `limit` | a number of hits | not stated | PRD §11.2, §13 |
| `max_recall_chars` | characters | 6,000 | PRD §7 (*"default 6,000"*), `09`; PRD §11.2 names the field without a default |

## How each source lists it

| Source | Wording |
|---|---|
| PRD §11.2 | *"Add a `memory` block to `settings` (adapter id, endpoint / key ref, enabled scopes, recall limit, `max_recall_chars`)"* |
| PRD §13 | *"the adapter (`none` / `local` / self-hosted Mem0 / Mem0 cloud), its endpoint or key ref, which scopes are enabled (user / project / agent / task), and the recall limit"* (no `max_recall_chars`) |
| `09-memory.md` | *"a `memory` block in `settings` — adapter id, endpoint (self-host URL / cloud key ref), enabled scopes, recall `limit`, `max_recall_chars`"* |
| `06` §15 | *"a **memory** block … — adapter id (`mem0`/`local`/`none`), endpoint or key ref, enabled scopes, recall limit"* (no `mem0-cloud`, no `max_recall_chars`) |
| Drawio harness | SQLite card: *"settings (memory, sandbox_profile)"* |

## Shape

PRD §5 defines `settings` as a key–value table:

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

PRD §7 names the cap `settings.memory.max_recall_chars`, a path into a nested block.

> [!example] Proposal (not in the sources)
> One row with `key = 'memory'` and a JSON `value`:
> ```json
> { "adapter": "none", "endpoint": null, "key_ref": null, "scopes": ["user"], "recall_limit": null, "max_recall_chars": 6000 }
> ```
> Settings And Plumbing does not define these fields: its [[Settings Data Model]] types the block as `memory: MemorySettingsSchema` with the comment *"shape proposed by Memory"*, deferring the shape to this note. Its [[Settings Defaults]] lists *Memory scopes* as *"`user` first"*, marked as a recommendation, which matches `scopes: ["user"]`. `scopes: ["user"]` follows the README's *"`user` scope first"*; the sources give no default. A key ref names a secret, it does not hold one. See [[Memory Open Questions]] #3, #21.

## Not in settings

- No per-flow or per-step memory switch, although `09` speaks of a flow opting in and scopes *"per step"*. See [[Memory Open Questions]] #4.
- No retention or forgetting setting. See #18.

## Related

- [[Memory Off By Default]]
- [[Memory Data Model]]
- [[Draft Mode]]
- [[Memory Settings Block]]
- [[Memory Index]]
