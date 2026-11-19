import { cacheLife } from 'next/cache';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderDoc } from './render.ts';

// The Obsidian note stays the source; the docs page renders it and the side rail lists its sections.
const SOURCE = path.join(process.cwd(), 'docs/Lamproom/Running Agent Work.md');

/** Prerendered with the route; 'minutes' re-reads the note at most a minute after you edit it. */
export async function loadDoc() {
  'use cache';
  cacheLife('minutes');
  return renderDoc(await readFile(SOURCE, 'utf8'));
}
