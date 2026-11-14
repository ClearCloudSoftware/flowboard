/**
 * MarkdownTaskSource — reads a markdown backlog file, returns ParsedTask[].
 *
 * The reference adapter. No credentials, no network, no pagination. Mirrors
 * the three-file split: options.ts (input resolution, pure), normalize.ts
 * (the parser, pure), provider.ts (I/O + the TaskSource interface).
 *
 * See docs/Lamproom/Intake And Import/Markdown Task Source.md.
 */

import { readFile } from 'node:fs/promises';
import {
  type SourceCapability,
  type SourceId,
  type SourceInput,
  type SourceResult,
  type TaskSource,
  ZERO_SOURCE_USAGE,
} from '@lamproom/core';
import { parseMarkdown } from './normalize.ts';
import { resolveInput } from './options.ts';

export class MarkdownTaskSource implements TaskSource {
  readonly id: SourceId = 'markdown';
  readonly capabilities: ReadonlySet<SourceCapability> = new Set<SourceCapability>([
    'pull',
    'rich_body',
    'acceptance_criteria',
  ]);

  async fetch(input: SourceInput): Promise<SourceResult> {
    const resolved = resolveInput(input);
    const content = resolved.content ?? (await readFile(resolved.path!, 'utf8'));
    const tasks = parseMarkdown(content, this.id);
    return {
      tasks,
      usage: { ...ZERO_SOURCE_USAGE, bytesRead: content.length },
    };
  }
}
