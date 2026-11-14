/**
 * TaskSource — the port that makes ticket systems interchangeable.
 *
 * Mirrors AgentProvider: one port in core, three-file adapters in
 * `adapters/src/ticket/<markdown|github|...>/`. The runner, the import route
 * and the UI program against this interface; adapters hold the per-source
 * SDK code. No file under `core/` or the runner may import an adapter —
 * only this port. The dependency rule is enforced the same way.
 *
 * An adapter's job is exactly two mappings:
 *   1. SourceInput  ->  the source's native request (REST params, GraphQL
 *      variables, JQL string, or a markdown file path).
 *   2. the source's native response  ->  ParsedTask[] (one shape, deeply
 *      validated: see Trust Boundary in the spec).
 *
 * The port supports two entry points. `fetch()` is pull — the runner asks
 * the source for the next page. `ingest()` is push — a webhook handler hands
 * the raw body + headers to the adapter, which verifies the signature and
 * returns the same SourceResult shape. An adapter declares which entry
 * points it implements via its capability set; attempting to call a method
 * whose capability is absent is a programming error.
 *
 * importKey is ALWAYS server-derived. An adapter supplies the ImportKeyHint
 * (an upstream id if the source has one, plus the title slug); the server
 * runs deriveImportKey against the per-source UpstreamKeyPolicy. This is the
 * rule the v1 duplicate-import bug exists for.
 *
 * See docs/Lamproom/Intake And Import/TaskSource Port.md,
 *     docs/superpowers/specs/2026-11-14-task-source-port-design.md.
 */

import type { SourceUsage } from './ticket.ts';

// ---------------------------------------------------------------------------
// Identity & capabilities
// ---------------------------------------------------------------------------

/**
 * Well-known source ids; the `(string & {})` keeps autocomplete without
 * closing the set — same pattern as ProviderId.
 */
export type SourceId =
  | 'markdown'
  | 'github'
  | 'linear'
  | 'jira'
  | 'webhook'
  | 'replay'
  | (string & {});

/**
 * What a source can do. The runner queries this BEFORE using a knob and
 * degrades gracefully when it is absent. For example: if `incremental` is
 * absent, the runner must full-fetch each sync; if `pagination` is absent,
 * the runner reads once and does not pass a `cursor`.
 *
 *   pull                    fetch(input) is implemented.
 *   push                    ingest(event, headers) is implemented.
 *   pagination              SourceInput.cursor and SourceResult.nextCursor
 *                           are honoured; the caller loops.
 *   incremental             SourceInput.since is honoured (ISO timestamp,
 *                           updated-since semantics).
 *   rich_body               body is preserved verbatim (markdown or similar);
 *                           when absent the body may be a single flattened
 *                           string with structure lost.
 *   acceptance_criteria     normalize extracts acceptanceCriteria / nonGoals
 *                           into first-class fields on ParsedTask.
 *   labels                  ParsedTask.labels is populated when present at
 *                           the source.
 *   assignees               ParsedTask.assignees is populated when present.
 *   stable_upstream_key     the source's own id is stable enough to key on
 *                           (checked via UpstreamKeyPolicy at derive time).
 *
 * Future flags (write_back, reactions, mentions, custom_fields) are deliberately
 * absent — add them when the adapter that needs them lands.
 */
export type SourceCapability =
  | 'pull'
  | 'push'
  | 'pagination'
  | 'incremental'
  | 'rich_body'
  | 'acceptance_criteria'
  | 'labels'
  | 'assignees'
  | 'stable_upstream_key';

// ---------------------------------------------------------------------------
// Task shape
// ---------------------------------------------------------------------------

/**
 * The hint an adapter hands up for identity derivation.
 *
 * `upstream` is the source's own id when it has one — a GitHub issue number
 * (`"42"`), a Jira key (`"PROJ-123"`), a Linear identifier (`"ENG-7"`), the
 * explicit markdown slug (`"{#backfill}"` → `"backfill"`). The server decides
 * whether to trust it via the per-source UpstreamKeyPolicy; untrusted
 * upstreams are ignored and the key falls back to `titleSlug`.
 *
 * `titleSlug` is always present — computed by the adapter via `slugify(title)`.
 * This is the last-resort key when no upstream is trusted.
 *
 * `_hint` is kept on ParsedTask after derivation for audit, so a reviewer can
 * see why a given importKey was chosen.
 */
export interface ImportKeyHint {
  upstream?: string;
  titleSlug: string;
}

/**
 * One task as it arrives from a source. The upsert loop keys on
 * (project_id, source_id, importKey).
 *
 * `acceptanceCriteria` and `nonGoals` are first-class fields (settles Intake
 * OQ #2) — populated when the source has the `acceptance_criteria` capability
 * and the adapter actually extracted them.
 *
 * `extras` is the escape hatch for per-source fields the port chose not to
 * standardise (Jira customField_10001, GitHub milestone, Linear project). It
 * is opaque to the runner; UI code may render known keys per source.
 *
 * `_hint` is populated by the adapter and kept untouched after deriveImportKey
 * runs; it is NOT the key itself.
 */
export interface ParsedTask {
  importKey: string;
  title: string;
  body?: string;
  acceptanceCriteria?: string[];
  nonGoals?: string[];
  labels?: string[];
  assignees?: string[];
  extras?: Record<string, unknown>;
  _hint: ImportKeyHint;
}

// ---------------------------------------------------------------------------
// Fetch shape
// ---------------------------------------------------------------------------

/**
 * Input to fetch(). Fields are optional and adapters ignore what they do not
 * understand; a markdown adapter only looks at `content`/`path`, a GitHub
 * adapter only looks at `query`/`since`/`cursor`/`pageSize`.
 *
 * An adapter MUST error (not silently ignore) if a caller supplies an
 * input it understands but that violates its contract — e.g. a `cursor`
 * without `pagination` capability, a `since` without `incremental`.
 */
export interface SourceInput {
  content?: string;
  path?: string;
  query?: string;
  since?: string;
  cursor?: string;
  pageSize?: number;
}

/**
 * The result of one fetch() call.
 *
 * `nextCursor` is present only when the page did not drain the source. The
 * caller loops: `let cursor; do { const r = await src.fetch({cursor}); cursor
 * = r.nextCursor; ... } while (cursor);`. Adapters MUST NOT loop internally —
 * hiding pagination makes quotas opaque and progress unreportable.
 *
 * `usage` carries the quota consumed by THIS call. The caller sums usages
 * across a pagination loop via `addUsage` from ticket.ts.
 */
export interface SourceResult {
  tasks: ParsedTask[];
  nextCursor?: string;
  usage: SourceUsage;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * A task source. Adapters live under `adapters/src/ticket/<id>/provider.ts`
 * and expose a class that implements this interface plus a constructor that
 * takes the source-specific dependencies (target repo, credential resolver,
 * retry policy, injectable transport for tests).
 *
 * At least one of `fetch` and `ingest` MUST be defined; which one is advertised
 * by the capability set. Calling a method that the capabilities say is not
 * supported is a programming error (throw TypeError or similar).
 */
export interface TaskSource {
  readonly id: SourceId;
  readonly capabilities: ReadonlySet<SourceCapability>;

  /** Pull entry point. Required when `pull` is in capabilities. */
  fetch?(input: SourceInput): Promise<SourceResult>;

  /**
   * Push entry point. Required when `push` is in capabilities.
   *
   * `event` is the raw request body bytes — adapters MUST verify the signature
   * against `headers` BEFORE parsing JSON. Trust boundary, enforced.
   */
  ingest?(event: Buffer, headers: Record<string, string>): Promise<SourceResult>;
}
