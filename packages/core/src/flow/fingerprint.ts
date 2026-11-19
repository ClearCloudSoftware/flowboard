import { createHash } from 'node:crypto';

/** A slash that starts a path (not one inside `src/a.ts`), up to a space, quote, bracket or comma. */
const ABSOLUTE_PATH = /(?<![\w.])\/[^\s'"()[\]{}<>,;]+/g;
/** 7+ hex characters with at least one digit: commit ids, object ids. */
const HEX_ID = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** A duration with its unit, so 980ms and 1.02s look alike. */
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ns|µs|us|ms|s|sec|secs|m|min|mins|h)\b/g;
/** Day and month names, as `date` and many loggers write them. */
const DATE_WORD =
  /\b(?:Mon|Tue(?:s)?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/g;

/**
 * sha256 hex of the last 20 non-empty lines, normalised in this order: absolute paths cut to their last
 * segment; UUIDs, hex ids (7+ hex characters including a digit), durations with their unit, and day and
 * month names removed; digits removed. Two failures with the same fingerprint failed the same way; timings,
 * dates, ids and checkout paths don't count.
 */
export function fingerprint(output: string): string {
  const lines = output
    .split('\n')
    .filter((l) => l.trim())
    .slice(-20)
    .map((l) =>
      l
        .replace(ABSOLUTE_PATH, (p) => p.split('/').filter(Boolean).at(-1) ?? '')
        .replace(UUID, '')
        .replace(HEX_ID, '')
        .replace(DURATION, '')
        .replace(DATE_WORD, '')
        .replace(/\d/g, ''),
    );
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
