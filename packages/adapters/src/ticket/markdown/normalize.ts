/**
 * Markdown → ParsedTask[]. Pure.
 *
 * Rules the parser follows (lifted from docs/Lamproom/Intake And Import/
 * Backlog File Shapes.md and the markdown adapter section of
 * docs/superpowers/specs/2026-11-14-task-source-port-design.md):
 *
 *   - Only `##` headings open tasks. `#` and `#### `+ do not.
 *   - Prose before the first `##` is dropped.
 *   - Between one `##` and the next, the task's content is:
 *       * depth-3 heading "Acceptance criteria" → list items into
 *         ParsedTask.acceptanceCriteria.
 *       * depth-3 heading "Non-goals" / "Non goals" → list items into
 *         ParsedTask.nonGoals.
 *       * Any other content before the first special section → the body.
 *       * Content after the first special section is dropped (keep it simple;
 *         users who want more structure can split into separate tasks).
 *   - A trailing `{#slug}` at the end of a heading becomes the explicit
 *     upstream id. It is the `importKey` directly, bypassing deriveImportKey.
 *     Markdown's UpstreamKeyPolicy is 'never' — the explicit path is the
 *     only way to get a key that isn't a title slug.
 *   - Two tasks with the same explicit `{#slug}` throws (a file-level error).
 *     Two tasks with the same title get `-2`, `-3` suffixes via deriveImportKey.
 *
 * Body preservation: bodies are sliced from the original source string via
 * mdast position offsets. This preserves backticks, dollar signs and any
 * other content verbatim — the parser never re-serialises. Satisfies the
 * trust-boundary rule that ticket content is data, not instructions.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { deriveImportKey, slugify, type ImportKeyHint } from '@lamproom/core';
import type { ParsedTask, SourceId } from '@lamproom/core';

interface MdastPosition {
  start: { offset?: number };
  end: { offset?: number };
}

interface MdastNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MdastNode[];
  position?: MdastPosition;
}

const EXPLICIT_ID_RE = /^(.*?)\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/;
const ACCEPTANCE_RE = /^acceptance criteria$/i;
const NON_GOALS_RE = /^non[- ]goals?$/i;
const POLICY_NEVER = { trust: 'never' as const };

export function parseMarkdown(content: string, sourceId: SourceId): ParsedTask[] {
  const tree = unified().use(remarkParse).parse(content) as unknown as MdastNode;
  const children = tree.children ?? [];

  const tasks: ParsedTask[] = [];
  const seenKeys = new Set<string>();
  const explicitIds = new Set<string>();

  // Find the spans: [startIndex, endIndex) of each task in `children`.
  const spans: Array<{ heading: MdastNode; from: number; to: number }> = [];
  let currentStart: number | undefined;
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    if (node.type === 'heading' && node.depth === 2) {
      if (currentStart !== undefined) {
        spans.push({ heading: children[currentStart]!, from: currentStart + 1, to: i });
      }
      currentStart = i;
    }
  }
  if (currentStart !== undefined) {
    spans.push({ heading: children[currentStart]!, from: currentStart + 1, to: children.length });
  }

  for (const span of spans) {
    const { title, explicitId } = splitTitleAndExplicitId(textContent(span.heading));
    if (title === '') continue;

    const hint: ImportKeyHint = { titleSlug: slugify(title) };
    if (explicitId !== undefined) {
      if (explicitIds.has(explicitId)) {
        throw new Error(`markdown source: duplicate explicit id '${explicitId}'`);
      }
      explicitIds.add(explicitId);
      hint.upstream = explicitId;
    }

    const { bodyNodes, acceptanceCriteria, nonGoals } = splitSpan(span.from, span.to, children);

    const body = bodyNodes.length > 0 ? sliceSource(content, bodyNodes) : undefined;

    const importKey = explicitId !== undefined ? explicitId : deriveImportKey(sourceId, hint, POLICY_NEVER, seenKeys);
    if (explicitId !== undefined) seenKeys.add(importKey);

    const task: ParsedTask = { importKey, title, _hint: hint };
    if (body !== undefined) task.body = body;
    if (acceptanceCriteria.length > 0) task.acceptanceCriteria = acceptanceCriteria;
    if (nonGoals.length > 0) task.nonGoals = nonGoals;
    tasks.push(task);
  }

  return tasks;
}

function splitSpan(
  from: number,
  to: number,
  children: MdastNode[],
): { bodyNodes: MdastNode[]; acceptanceCriteria: string[]; nonGoals: string[] } {
  const bodyNodes: MdastNode[] = [];
  const acceptanceCriteria: string[] = [];
  const nonGoals: string[] = [];
  let mode: 'body' | 'acceptance' | 'non_goals' | 'drop' = 'body';

  for (let i = from; i < to; i++) {
    const node = children[i]!;
    if (node.type === 'heading' && node.depth === 3) {
      const headingText = textContent(node).trim();
      if (ACCEPTANCE_RE.test(headingText)) {
        mode = 'acceptance';
        continue;
      }
      if (NON_GOALS_RE.test(headingText)) {
        mode = 'non_goals';
        continue;
      }
      // An unrecognised depth-3 heading after a special section means "stop collecting
      // prose into body too" — we keep it simple and just drop the rest.
      mode = 'drop';
      continue;
    }
    if (mode === 'body' && node.type !== 'heading') bodyNodes.push(node);
    else if (mode === 'acceptance' && node.type === 'list') acceptanceCriteria.push(...listItems(node));
    else if (mode === 'non_goals' && node.type === 'list') nonGoals.push(...listItems(node));
  }

  return { bodyNodes, acceptanceCriteria, nonGoals };
}

function listItems(listNode: MdastNode): string[] {
  const items: string[] = [];
  for (const item of listNode.children ?? []) {
    items.push(textContent(item).trim());
  }
  return items;
}

function textContent(node: MdastNode): string {
  if (node.value !== undefined) return node.value;
  if (!node.children) return '';
  return node.children.map(textContent).join('');
}

function splitTitleAndExplicitId(headingText: string): { title: string; explicitId?: string } {
  const trimmed = headingText.trim();
  const match = trimmed.match(EXPLICIT_ID_RE);
  if (match) {
    return { title: match[1]!.trim(), explicitId: match[2] };
  }
  return { title: trimmed };
}

function sliceSource(content: string, nodes: MdastNode[]): string {
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const start = first.position?.start.offset;
  const end = last.position?.end.offset;
  if (start === undefined || end === undefined) return '';
  return content.slice(start, end).replace(/\s+$/, '');
}
