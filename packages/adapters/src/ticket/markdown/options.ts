/**
 * MarkdownTaskSource input resolution — pure.
 *
 * Decides where the markdown content comes from. The provider does the I/O
 * (reads the file when `path` is set); this module just validates the shape.
 */

import type { SourceInput } from '@lamproom/core';

export interface ResolvedInput {
  /** When set, provider reads this file. */
  path?: string;
  /** When set, provider uses this directly. */
  content?: string;
  /** Human-readable origin for error messages — `"<inline>"` or the path. */
  label: string;
}

export function resolveInput(input: SourceInput): ResolvedInput {
  const hasContent = input.content !== undefined;
  const hasPath = input.path !== undefined;

  if (hasContent && hasPath) {
    throw new Error('markdown source: pass content or path, not both');
  }
  if (!hasContent && !hasPath) {
    throw new Error('markdown source: pass content or path');
  }

  if (hasContent) return { content: input.content, label: '<inline>' };
  return { path: input.path, label: input.path! };
}
