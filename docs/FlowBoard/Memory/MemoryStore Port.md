---
tags: [flowboard, memory, port]
module: Memory
---

# MemoryStore Port

The sixth port, and the only optional one: *"cross-task memory so runs start warm instead of cold"* (`01-ports.md`). Core programs against it; adapters implement it.

> [!quote] `09-memory.md`
> *"Two calls carry the whole feature — the same shape as every other port: a small seam, all the vendor cleverness behind it."*

## The interface

From `docs/old/reference/core/ports/memory-store.ts`:

```ts
/** Who a memory belongs to. A single-user tool has exactly one `user` scope. */
export type MemoryScope =
  | { kind: 'user' } // the operator: standing prefs + recurring decisions
  | { kind: 'project'; projectId: string } // one codebase: conventions, gotchas, layout
  | { kind: 'agent'; agentId: string } // one role/skill: knowledge it accrues across runs
  | { kind: 'task'; taskId: string }; // within a task, across attempts (rework warm-start)

export interface MemoryHit {
  id: string;
  text: string;
  score: number;
  scope: MemoryScope;
  updatedAt: number;
}

export interface RecallQuery {
  /** Union of scopes for a run: user + the task's project + the step's agent + the task. */
  scopes: MemoryScope[];
  /** The assembled task/step context to match against. */
  query: string;
  limit?: number;
}

/** Message-like input Mem0 extracts facts from — a string, or a short role-tagged transcript. */
export type MessageLike = string | Array<{ role: 'user' | 'agent'; text: string }>;

export interface WriteInput {
  scope: MemoryScope;
  /** Distilled from declared artifacts/answers only — never raw agent chatter (see 09 trust boundary). */
  content: MessageLike;
  /** Provenance for the audit trail: runId, stepKey, source artifact type. */
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  readonly id: 'mem0' | 'mem0-cloud' | 'local' | 'none';
  /** Host-side, before launch. Hits become the 7th prompt part (background, not instructions). */
  recall(q: RecallQuery): Promise<MemoryHit[]>;
  /** Host-side, after a run succeeds. The adapter does fact-extraction + contradiction-resolution. */
  write(input: WriteInput): Promise<{ added: string[]; updated: string[] }>;
}
```

`01-ports.md` and `09-memory.md` carry the same shape in shorter form, with `recall` and `write` taking inline object types.

## The two calls

| Call | When | Who calls it | Does |
|---|---|---|---|
| `recall` | Before `launch()` | The runner, on the host | Returns ranked hits across the scope union. See [[Memory Recall]]. |
| `write` | After a run succeeds | The runner, on the host | Stores, or extracts and reconciles, facts. Returns the ids `added` and `updated`. See [[Memory Commit]]. |

*"The port is queried by the runner, never from a route"* (`01-ports.md`, pointing at `06` §15, where *"Every port is called from `src/lib/`, **never from a route**"*).

## Rules the port encodes

- **Additive.** *"core runs unchanged with the `none` adapter — memory makes runs warmer and cheaper, it is never a precondition for one to happen."* (`memory-store.ts`)
- **Host-side.** *"both brokered by the runner on the host (never from inside the agent process, so memory stays off the sandbox egress allowlist)"* (`memory-store.ts`).
- **The adapter reconciles, not FlowBoard.** *"contradiction-resolution done by the adapter, not by FlowBoard"* (`memory-store.ts`); *"the adapter resolves contradictions so FlowBoard never diffs facts by hand"* (`01-ports.md`).
- **Provenance travels with the write.** `metadata` holds *"runId, stepKey, source artifact type"*.

> [!note] Inferred
> `write()` takes exactly one `scope`, so a run whose output belongs to several scopes needs several writes. Under `local`, which stores *"as written"*, `updated` would always be empty. Neither is stated. See [[Memory Open Questions]] #11.

> [!warning] Adapter order in the header comment
> The file's header calls Mem0 *"the first adapter; a `local` SQLite adapter and a `none` no-op are the others"*. The PRD, `01-ports.md` and `09-memory.md` build `none`, then `local`, then Mem0. See [[Memory Open Questions]] #1. The header also points at `docs/architecture/09-memory.md`; the file is at `docs/old/architecture/09-memory.md`.

## Related

- [[Memory Adapters]]
- [[Memory Scopes]]
- [[Memory Runtime]]
- [[Agent Launch Contract]]
- [[Memory Index]]
