/**
 * TaskSource: where tasks come from, behind one port. A markdown backlog today (`MarkdownTaskSource`); the
 * `backlog-importer` agent is the "messy file" path; GitHub Issues, Linear, Jira and a webhook are later adapters.
 * A source only parses: writing rows is the caller's (an upsert on project + `import_key`).
 *
 * The rule the first build broke three times: `import_key` is derived here, on the server, never taken from an
 * agent or an upstream tool. An agent's key drifted between runs (`filter-list-by-status` vs
 * `filter-the-list-by-status`), and that is what duplicated tasks. So every adapter's output goes through `keyTasks`.
 */

/** One task as a source read it. `import_key`: stable across runs, the idempotency key. */
export interface ParsedTask {
  import_key: string;
  title: string;
  body?: string;
  acceptance_criteria?: string[];
  non_goals?: string[];
}

/** Pasted or uploaded text, or a file on this machine; `content` wins when both are given. */
export interface SourceInput {
  content?: string;
  path?: string;
}

export interface TaskSource {
  readonly id: string;
  fetch(input: SourceInput): Promise<ParsedTask[]>;
}

/** A task before its key is derived: `id` is the file's explicit id (`{#slug}`, front matter `id:`), when it has one. */
export type RawTask = Omit<ParsedTask, 'import_key'> & { id?: string };

/** Stable across runs: lowercase, every run of non `a-z0-9` becomes `-`, trimmed. `Filter list by status` -> `filter-list-by-status`. */
export const slugifyKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** An explicit id that is already a key: lowercase letters, digits and `-`, starting with a letter or digit. */
const EXPLICIT = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The tasks with their keys: the explicit id when it is a valid key, else the slug of the title; a title with nothing
 * left to slug (`日本語`) is `task`. A key already used in the same file gets `-2`, `-3`, … so two copies of a title
 * never land on one row. Titles are trimmed; a task with no title is dropped.
 */
export function keyTasks(raw: RawTask[]): ParsedTask[] {
  const seen = new Set<string>();
  const out: ParsedTask[] = [];
  for (const { id, ...t } of raw) {
    const title = t.title.trim();
    if (!title) continue;
    const explicit = id && EXPLICIT.test(id.toLowerCase()) ? id.toLowerCase() : undefined;
    const base = explicit ?? (slugifyKey(title) || 'task');
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base}-${n}`;
    seen.add(key);
    out.push({ ...t, title, import_key: key });
  }
  return out;
}
