/**
 * Server-derived import keys for TaskSource adapters.
 *
 * The rule the v1 duplicate-import bug exists for: adapters NEVER set
 * `importKey` directly. They hand up an `ImportKeyHint` (optional upstream id
 * + always-present titleSlug) and the server runs `deriveImportKey` against
 * the per-source `UpstreamKeyPolicy`. An adapter-generated key that drifts
 * between runs is the root cause of "re-import made 42 duplicates" and is
 * not a scenario this module ever allows.
 *
 * See docs/Lamproom/Intake And Import/Import Key.md and the "Import-key
 * policy" section of docs/superpowers/specs/2026-11-14-task-source-port-design.md.
 */

import type { ImportKeyHint } from './ports/task-source.ts';
import type { SourceId } from './ports/task-source.ts';

/**
 * How much to trust the source's own id.
 *
 *   never    — always use titleSlug. Markdown, replay, unsigned webhooks.
 *   numeric  — use `${sourceId}-${upstream}` when `upstream` is an integer.
 *              GitHub issue numbers; stable, scoped by repo, impossible to
 *              collide with a slugified title via this path.
 *   prefix   — use `slugify(upstream)` when `upstream` matches validPrefix.
 *              Jira `PROJ-123`, Linear `ENG-7`. The regex is anchored by the
 *              caller.
 *
 * A failed check falls back to `slugify(titleSlug)` — never throws. An
 * adapter still gets a stable key, just not the upstream's.
 */
export type UpstreamKeyPolicy =
  | { readonly trust: 'never' }
  | { readonly trust: 'numeric' }
  | { readonly trust: 'prefix'; readonly validPrefix: RegExp };

/**
 * ASCII-safe slugify. Pure. Idempotent.
 *
 * Rules:
 *   1. Unicode-normalise (NFKD) and drop combining marks — `Café` → `Cafe`,
 *      `Åland` → `Aland`.
 *   2. Lowercase.
 *   3. Replace any run of `[^a-z0-9]+` with a single `-`.
 *   4. Trim leading and trailing `-`.
 *   5. Empty result → `'untitled'`.
 *
 * Non-ASCII characters that have no decomposition (CJK, Devanagari, etc.) are
 * dropped silently — a title that is entirely non-ASCII becomes `'untitled'`.
 * This is a conscious trade-off: predictability across platforms beats
 * transliteration quality. If a user needs their non-Latin titles preserved,
 * they can give the task an explicit `{#slug}` upstream.
 */
export function slugify(input: string): string {
  const normalised = input.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dashed = normalised
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return dashed === '' ? 'untitled' : dashed;
}

/**
 * Derive the import key for one task.
 *
 * `seenInBatch` is the caller's accumulator across one import run — a Set the
 * caller creates once and passes to every derive call in the batch. On a
 * within-batch collision the key gets a `-2`, `-3`, ... suffix. The returned
 * key is added to `seenInBatch` before this function returns.
 *
 * The function never throws. An adapter MAY throw separately if the adapter's
 * own rules forbid duplicate upstreams within one import (e.g. the markdown
 * adapter rejects a file with two `{#same}` slugs); that check belongs in the
 * adapter, not here.
 */
export function deriveImportKey(
  sourceId: SourceId,
  hint: ImportKeyHint,
  policy: UpstreamKeyPolicy,
  seenInBatch: Set<string>,
): string {
  const candidate = pickCandidate(sourceId, hint, policy);
  const deduped = disambiguate(candidate, seenInBatch);
  seenInBatch.add(deduped);
  return deduped;
}

function pickCandidate(sourceId: SourceId, hint: ImportKeyHint, policy: UpstreamKeyPolicy): string {
  const upstream = hint.upstream;
  if (upstream !== undefined) {
    if (policy.trust === 'numeric' && /^\d+$/.test(upstream)) {
      return `${sourceId}-${upstream}`;
    }
    if (policy.trust === 'prefix' && policy.validPrefix.test(upstream)) {
      return slugify(upstream);
    }
  }
  return slugify(hint.titleSlug);
}

function disambiguate(candidate: string, seen: Set<string>): string {
  if (!seen.has(candidate)) return candidate;
  for (let n = 2; ; n++) {
    const next = `${candidate}-${n}`;
    if (!seen.has(next)) return next;
  }
}
