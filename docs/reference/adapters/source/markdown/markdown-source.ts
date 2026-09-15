/**
 * MarkdownTaskSource — a TaskSource that turns a markdown backlog into tasks.
 *
 * The whole point is the two rules the old build got wrong three times
 * (backlog Story 7.3):
 *   1. ONE parser, BOTH shapes — `##`/`###` heading-as-task, and a category
 *      heading whose `- **Title** …` bullets are the tasks.
 *   2. `import_key` is ALWAYS server-derived (explicit `{#slug}` wins, else
 *      slugify(title)). Never trust an upstream/agent key — an unstable key is
 *      what duplicated tasks across runs.
 *
 * Run the self-check:  node docs/reference/adapters/source/markdown/markdown-source.ts
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ParsedTask, SourceInput, TaskSource } from '../../../core/ports/task-source';

export class MarkdownTaskSource implements TaskSource {
  readonly id = 'markdown' as const;

  async fetch(input: SourceInput): Promise<ParsedTask[]> {
    const content = input.content ?? (input.path ? await readFile(input.path, 'utf8') : '');
    return parseMarkdown(content);
  }
}

export function parseMarkdown(md: string): ParsedTask[] {
  const lines = md.split(/\r?\n/);
  const tasks: ParsedTask[] = [];
  const seen = new Set<string>();

  const push = (rawTitle: string, body: string) => {
    const { title, id } = splitId(rawTitle);
    let key = id ?? slugify(title);
    // de-dupe within one file so a repeated title can't collide on its key
    for (let n = 2; seen.has(key); n++) key = `${slugify(title)}-${n}`;
    seen.add(key);
    tasks.push({ import_key: key, title, body: body.trim() || undefined });
  };

  // Split into heading blocks. A block is a heading plus the lines under it.
  type Block = { heading: string; lines: string[] };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) blocks.push((cur = { heading: h[2].trim(), lines: [] }));
    else if (cur) cur.lines.push(line);
    // ponytail: lines before the first heading are ignored (no ambiguous parent)
  }

  for (const b of blocks) {
    const bulletRe = /^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:[-–—:]\s*)?(.*)$/;
    const bullets = b.lines.filter((l) => bulletRe.test(l));
    if (bullets.length > 0) {
      // category heading: each bold bullet is a task
      for (const bl of bullets) {
        const m = bulletRe.exec(bl);
        if (m) push(m[1].trim(), m[2] ?? '');
      }
    } else {
      // the heading itself is the task; its lines are the body
      push(b.heading, b.lines.join('\n'));
    }
  }
  return tasks;
}

/** Pull an explicit `{#slug}` id off the end of a title, if present. */
function splitId(title: string): { title: string; id?: string } {
  const m = /^(.*?)\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/.exec(title);
  return m ? { title: m[1].trim(), id: m[2] } : { title };
}

/** Stable across runs: lowercase, non-alphanumeric runs → '-', trimmed. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// --- self-check ------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  // shape A — heading-as-task, with an explicit id on the second
  const a = parseMarkdown(
    `## Add OAuth login\nSupport Google + GitHub.\n\n## Fix flaky test {#flaky-cart}\nRetries needed.`,
  );
  assert.deepEqual(a.map((t) => t.import_key), ['add-oauth-login', 'flaky-cart']);
  assert.equal(a[0].body, 'Support Google + GitHub.');

  // shape B — category heading + bold bullets
  const b = parseMarkdown(
    `## Backlog\n- **Filter list by status** — add a dropdown\n- **Export CSV**: from the table`,
  );
  assert.deepEqual(b.map((t) => t.title), ['Filter list by status', 'Export CSV']);
  assert.deepEqual(b.map((t) => t.import_key), ['filter-list-by-status', 'export-csv']);

  // stability — same title yields the same key every run (the drift bug)
  assert.equal(slugify('Filter list by status'), 'filter-list-by-status');
  assert.deepEqual(
    parseMarkdown('## Filter list by status'),
    parseMarkdown('## Filter list by status'),
  );

  console.log('MarkdownTaskSource self-check passed');
}
