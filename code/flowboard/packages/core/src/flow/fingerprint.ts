import { createHash } from 'node:crypto';

/** A slash that starts a path (not one inside `src/a.ts`), up to a space, quote, bracket or comma. */
const ABSOLUTE_PATH = /(?<![\w.])\/[^\s'"()[\]{}<>,;]+/g;
/** 7+ hex characters with at least one digit: commit ids, object ids. */
const HEX_ID = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/gi;

/**
 * sha256 hex of the last 20 non-empty lines, normalised in this order: absolute paths cut to their last
 * segment, hex ids (7+ hex characters including a digit) removed, digits removed. Two failures with the same
 * fingerprint failed the same way; timings, ids and checkout paths don't count.
 */
export function fingerprint(output: string): string {
  const lines = output
    .split('\n')
    .filter((l) => l.trim())
    .slice(-20)
    .map((l) =>
      l
        .replace(ABSOLUTE_PATH, (p) => p.split('/').filter(Boolean).at(-1) ?? '')
        .replace(HEX_ID, '')
        .replace(/\d/g, ''),
    );
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
