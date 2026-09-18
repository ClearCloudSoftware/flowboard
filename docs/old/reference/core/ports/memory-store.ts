/**
 * MemoryStore — agentic memory behind one port. Mem0 (self-hosted OSS by
 * default, managed cloud as the remote tier) is the first adapter; a `local`
 * SQLite adapter and a `none` no-op are the others. Additive, not load-bearing:
 * core runs unchanged with the `none` adapter — memory makes runs warmer and
 * cheaper, it is never a precondition for one to happen.
 *
 * Two calls carry the feature, both brokered by the runner on the host (never
 * from inside the agent process, so memory stays off the sandbox egress
 * allowlist): `recall` before launch injects a 7th prompt part; `write` after a
 * successful run distils facts, with contradiction-resolution done by the
 * adapter, not by FlowBoard.
 *
 * See docs/architecture/09-memory.md.
 */

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
