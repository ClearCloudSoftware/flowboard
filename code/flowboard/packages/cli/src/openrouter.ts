/**
 * OpenRouter, for OpenCode's steps: the API key FlowBoard keeps, OpenRouter's list of models and their prices, and
 * the rules the approved list (`AppSettings.opencodeModels`) makes of them.
 *
 * The key is the one credential FlowBoard stores: `secrets.json` in its data folder, apart from `settings.json` so
 * no page ever reads it, owner-only where the OS has file modes. An exported OPENROUTER_API_KEY wins over it.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readAppSettings } from './app-settings.ts';
import { isFile, writeJsonFile } from './config.ts';
import type { ModelRules } from './config.ts';
import { type Catalogue, type CatalogueModel, isFree, modelProblem } from './settings.ts';

export const KEY_VAR = 'OPENROUTER_API_KEY';
const API = 'https://openrouter.ai/api/v1';
/** How old a saved list may be before a page or a run fetches it again. */
export const CATALOGUE_MAX_AGE_MS = 60 * 60_000;

const secretsOf = (dataDir: string) => join(dataDir, 'secrets.json');
const catalogueOf = (dataDir: string) => join(dataDir, 'openrouter-models.json');
const readJson = (file: string): unknown => {
  try {
    return isFile(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  } catch {
    return undefined; // ponytail: a file that does not parse counts as absent; only this module writes it
  }
};

// --- the key ---------------------------------------------------------------------------------------------------

/** The saved key, or undefined. */
export function savedKey(dataDir: string): string | undefined {
  const s = readJson(secretsOf(dataDir)) as { openrouter?: unknown } | undefined;
  return typeof s?.openrouter === 'string' ? s.openrouter : undefined;
}

/** An OpenRouter key: `sk-or-` and no spaces. Checked before it is saved; OpenRouter says whether it works. */
export const KEY_RE = /^sk-or-\S{8,300}$/;

export function saveKey(dataDir: string, key: string): { ok: true } | { ok: false; error: string } {
  const k = key.trim();
  if (!KEY_RE.test(k)) return { ok: false, error: 'not an OpenRouter key: they start with sk-or-' };
  writeJsonFile(secretsOf(dataDir), { openrouter: k }, 0o600);
  return { ok: true };
}

export const removeKey = (dataDir: string) => rmSync(secretsOf(dataDir), { force: true });

/** Which key runs would use, never the key itself: `source` env when exported, saved when only saved. */
export interface KeyView { source: 'env' | 'saved' | null; last4: string | null }
export function keyView(dataDir: string, env: NodeJS.ProcessEnv = process.env): KeyView {
  const key = env[KEY_VAR] || savedKey(dataDir);
  return { source: env[KEY_VAR] ? 'env' : key ? 'saved' : null, last4: key ? key.slice(-4) : null };
}

/** Puts the saved key in `env` for OpenCode and the sandboxes to pick up, unless one is exported already. */
export function applySavedKey(dataDir: string, env: NodeJS.ProcessEnv = process.env) {
  const key = savedKey(dataDir);
  if (key && !env[KEY_VAR]) env[KEY_VAR] = key;
}

/** What OpenRouter says of the key: its name, credit limit (null for none) and what it has spent, in dollars. */
export type KeyTest = { ok: true; label: string; limitUsd: number | null; usageUsd: number; remainingUsd: number | null } | { ok: false; error: string };
export async function testKey(key: string, fetchFn: typeof fetch = fetch): Promise<KeyTest> {
  try {
    const res = await fetchFn(`${API}/key`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { message?: string } };
    if (!res.ok || !body.data) return { ok: false, error: res.status === 401 ? 'OpenRouter does not know this key' : (body.error?.message ?? `OpenRouter answered ${res.status}`) };
    const n = (v: unknown) => (typeof v === 'number' ? v : null);
    const d = body.data;
    return { ok: true, label: typeof d.label === 'string' ? d.label : '', limitUsd: n(d.limit), usageUsd: n(d.usage) ?? 0, remainingUsd: n(d.limit_remaining) };
  } catch (e) {
    return { ok: false, error: `OpenRouter did not answer: ${(e as Error).message}` };
  }
}

// --- the models ------------------------------------------------------------------------------------------------

/** OpenRouter's `/models` answer as a catalogue: prices per token become dollars per million; ids get `openrouter/`. */
export function toCatalogue(json: unknown, now = new Date()): Catalogue {
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error('OpenRouter sent no model list');
  const models: CatalogueModel[] = [];
  for (const m of data as { id?: unknown; name?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }[]) {
    const pin = Number(m.pricing?.prompt);
    const pout = Number(m.pricing?.completion);
    // A negative or missing price (OpenRouter's own router models) is no price at all: leave the model out.
    if (typeof m.id !== 'string' || !(pin >= 0) || !(pout >= 0)) continue;
    const price = { in: Number((pin * 1e6).toFixed(6)), out: Number((pout * 1e6).toFixed(6)) };
    models.push({ id: `openrouter/${m.id}`, name: typeof m.name === 'string' ? m.name : m.id, free: pin === 0 && pout === 0, price, context: typeof m.context_length === 'number' ? m.context_length : null });
  }
  return { fetchedAt: now.toISOString(), models: models.sort((a, b) => a.id.localeCompare(b.id)) };
}

/** The list as last fetched, or null before the first fetch. */
export function readCatalogue(dataDir: string): Catalogue | null {
  const c = readJson(catalogueOf(dataDir)) as Catalogue | undefined;
  return c && Array.isArray(c.models) && typeof c.fetchedAt === 'string' ? c : null;
}

/**
 * The list, fetched again when the saved one is older than `maxAgeMs` (0: always). A failed fetch keeps the saved
 * list and says why. The list is public, so no key is sent.
 */
export async function refreshCatalogue(dataDir: string, maxAgeMs = CATALOGUE_MAX_AGE_MS, fetchFn: typeof fetch = fetch, now = new Date()): Promise<{ catalogue: Catalogue | null; error?: string }> {
  const saved = readCatalogue(dataDir);
  if (saved && maxAgeMs > 0 && now.getTime() - Date.parse(saved.fetchedAt) < maxAgeMs) return { catalogue: saved };
  try {
    const res = await fetchFn(`${API}/models`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`OpenRouter answered ${res.status}`);
    const fresh = toCatalogue(await res.json(), now);
    writeJsonFile(catalogueOf(dataDir), fresh);
    return { catalogue: fresh };
  } catch (e) {
    return { catalogue: saved, error: `could not fetch OpenRouter's models: ${(e as Error).message}` };
  }
}

/** The approved list's rules as the checks take them, against the saved list (never fetched here: checks are sync). */
export function modelRules(dataDir: string): ModelRules {
  const approved = readAppSettings(dataDir).opencodeModels;
  const catalogue = readCatalogue(dataDir);
  return { problem: (id) => modelProblem(id, approved, catalogue), free: (id) => isFree(id, approved, catalogue) };
}

/**
 * What run-agent and run-flow do first: put the saved key where OpenCode finds it, fetch the model list when it is
 * stale (so a price rise is seen), and hand back the rules to check the steps' models against.
 */
export async function prepareRun(dataDir: string, warn: (line: string) => void): Promise<ModelRules> {
  applySavedKey(dataDir);
  // With nothing approved every OpenCode step is refused anyway: no fetch, and no warning on an offline Claude run.
  if (readAppSettings(dataDir).opencodeModels.length) {
    const { error } = await refreshCatalogue(dataDir);
    if (error) warn(`-- warning: ${error}; checking models against the list saved earlier`);
  }
  return modelRules(dataDir);
}
