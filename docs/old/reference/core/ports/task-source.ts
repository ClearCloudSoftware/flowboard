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

/**
 * TaskSource — ingestion behind one port. Markdown import today; GitHub Issues,
 * Linear, and webhooks are other adapters. Every adapter must derive
 * `import_key` itself and never trust an upstream/agent-supplied key — an
 * unstable key is what duplicated tasks across runs (backlog Story 7.3).
 *
 * See docs/architecture/05-environment-and-registry.md.
 */
export interface TaskSource {
  readonly id: string;
  fetch(input: SourceInput): Promise<ParsedTask[]>;
}
