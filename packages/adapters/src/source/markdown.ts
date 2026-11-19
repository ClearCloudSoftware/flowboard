/**
 * MarkdownTaskSource: a markdown backlog as tasks, deterministically. One parser for both shapes the first build
 * split across two:
 *   A. a `##`/`###` heading is a task, the lines under it its body;
 *   B. a heading whose `- **Title** — text` bullets are the tasks (the heading only groups them).
 * A `###`/`####` heading named *Acceptance criteria* or *Non-goals* (or *AC*, *Done when*, *Out of scope*) under a
 * task fills that field instead of starting a task. Keys come from `keyTasks` (explicit `{#slug}` at the end of a
 * title, or front matter `id:` in a one-task file, else the title's slug), never from the file's author guessing.
 * Text before the first heading, front matter included, is not a task.
 */
import { readFile } from 'node:fs/promises';
import { keyTasks, type ParsedTask, type RawTask, type SourceInput, type TaskSource } from '@lamproom/core';

export class MarkdownTaskSource implements TaskSource {
  readonly id = 'markdown' as const;

  async fetch(input: SourceInput): Promise<ParsedTask[]> {
    return parseMarkdown(input.content ?? (input.path ? await readFile(input.path, 'utf8') : ''));
  }
}

const HEADING = /^(#{2,4})\s+(.*?)(?:\s+#+)?\s*$/;
const BOLD_BULLET = /^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:[-–—:]\s*)?(.*)$/;
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const SUBSECTIONS: [RegExp, 'acceptance_criteria' | 'non_goals'][] = [
  [/^(acceptance criteria|ac|done when)\s*:?$/i, 'acceptance_criteria'],
  [/^(non[- ]goals|out of scope)\s*:?$/i, 'non_goals'],
];
const subsection = (heading: string) => SUBSECTIONS.find(([re]) => re.test(heading))?.[1];

type Block = { heading: string; lines: string[]; field?: 'acceptance_criteria' | 'non_goals' };

export function parseMarkdown(md: string): ParsedTask[] {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md);
  const fileId = front && /^id:\s*["']?([^"'\s]+)["']?\s*$/m.exec(front[1])?.[1];

  const blocks: Block[] = [];
  let cur: Block | undefined;
  for (const line of md.slice(front?.[0].length ?? 0).split(/\r?\n/)) {
    const h = HEADING.exec(line);
    const field = h && subsection(h[2]);
    if (h && (field || h[1].length <= 3)) blocks.push((cur = { heading: h[2], lines: [], ...(field && { field }) }));
    else cur?.lines.push(line); // ponytail: lines before the first heading are ignored (no ambiguous parent)
  }

  const raw: RawTask[] = [];
  for (const b of blocks) {
    if (b.field) {
      // A sub-section belongs to the task just before it; with none, it is dropped.
      const items = b.lines.filter((l) => l.trim()).map((l) => (ITEM.exec(l)?.[1] ?? l).trim()).filter(Boolean);
      const last = raw.at(-1);
      if (last && items.length) last[b.field] = [...(last[b.field] ?? []), ...items];
      continue;
    }
    const bullets = b.lines.map((l) => BOLD_BULLET.exec(l)).filter((m) => m !== null);
    if (bullets.length) for (const m of bullets) raw.push({ ...splitId(m[1]), body: m[2].trim() || undefined });
    else raw.push({ ...splitId(b.heading), body: b.lines.join('\n').trim() || undefined });
  }
  // Front matter belongs to the whole file, so its id can key only a file of one task.
  if (fileId && raw.length === 1 && !raw[0].id) raw[0].id = fileId;
  return keyTasks(raw);
}

/** An explicit `{#slug}` off the end of a title. */
function splitId(title: string): { title: string; id?: string } {
  const m = /^(.*?)\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/.exec(title.trim());
  return m ? { title: m[1].trim(), id: m[2] } : { title: title.trim() };
}
