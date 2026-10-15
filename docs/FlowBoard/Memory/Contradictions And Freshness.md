---
tags: [flowboard, memory, behaviour]
module: Memory
---

# Contradictions And Freshness

How memory stays true when facts change. The answer depends on the adapter.

| Adapter | What happens when a new fact contradicts an old one | Source |
|---|---|---|
| `local` | Both are kept. *"stored as written and recall prefers the newest"* | PRD §11.2, `09` |
| Mem0 | The old one is superseded: *"when a new fact contradicts an old one ("now uses vitest, not jest") it supersedes rather than duplicates"* | `09` |

> [!quote] `09-memory.md`
> *"FlowBoard never diffs memories by hand — that is the entire reason to take a memory layer off the shelf rather than grow tables."*

The feature map §21 promises the Mem0 version: *"a new fact that contradicts an old one replaces it ("now uses vitest, not jest") instead of piling up, so the memory stays true without you curating it."*

## Under `local`

Newest-first ranking is the only freshness control. A stale fact can still be recalled when:

- the newer fact doesn't match the query's keywords and the older one does (inferred), or
- both fit under `max_recall_chars`, so the agent sees both (inferred).

The label *"background, not instructions"* softens this; it does not prevent it. This is one reason `09` makes Mem0 the upgrade *"when … recall quality is the limit"*.

## What no source covers

| Missing | Notes |
|---|---|
| Forgetting | No delete, expiry, or retention rule for any adapter |
| Editing | No way to correct a wrong memory |
| Task memories after the task | Kept forever, or dropped when the task ends? |
| Project removal | What happens to its memories |
| Undo | An answer undone after commit ([[Human In The Loop Open Questions]] #16) |
| Seeing memories | No screen or API lists them (`run_memories` only records recall) |

See [[Memory Open Questions]] #18 and #19.

## Related

- [[Local Memory Adapter]]
- [[Mem0 Adapter]]
- [[Memory Commit]]
- [[Memory Index]]
