/**
 * Ollama on this machine, for OpenCode's steps: where it listens, its local tool-capable models and the window each
 * runs with, and the OpenCode config that points a run at it. Only this machine: an OLLAMA_HOST elsewhere is refused.
 *
 * The window a model actually runs with, decided 2026-11-15 (handoff spec, "Verification results"), in order:
 * `num_ctx` in its /api/show parameters; else OLLAMA_CONTEXT_LENGTH in FlowBoard's environment; else the
 * `context_length` /api/ps reports while it is loaded; else unknown. Unknown is not warned of: Ollama's own default
 * depends on the machine's memory (262,144 tokens on a 128 GB Mac), and the API does not report it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isFile, writeJsonFile } from './config.ts';
import type { LocalModels, OllamaModel } from './settings.ts';

const DEFAULT_PORT = 11434;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
/** How long a page or a run waits on Ollama: it is on this machine, so a slow answer means it is not there. */
const TIMEOUT_MS = 5_000;
// ponytail: a fixed reply budget, as the spike ran it; derive it from the window if long writes get cut off
const OUTPUT_TOKENS = 8192;

export interface OllamaAddress { scheme: string; host: string; port: number; url: string }

/** OLLAMA_HOST read as the ollama CLI reads it (envconfig.Host), default 127.0.0.1:11434; refused off this machine. */
export function ollamaAddress(env: NodeJS.ProcessEnv = process.env): OllamaAddress | { error: string } {
  const raw = (env.OLLAMA_HOST ?? '').trim();
  const [scheme, after] = raw.includes('://') ? raw.split('://', 2) : ['http', raw];
  const fallback = scheme === 'https' ? 443 : raw.includes('://') ? 80 : DEFAULT_PORT;
  const rest = after.split('/')[0];
  const m = /^\[([^\]]*)\]:(\d*)$/.exec(rest) ?? /^([^:]*):(\d*)$/.exec(rest);
  let host = (m ? m[1] : rest.replace(/^\[|\]$/g, '')) || '127.0.0.1';
  const n = m ? Number(m[2]) : NaN;
  const port = m && m[2] !== '' && n >= 0 && n <= 65535 ? n : fallback;
  if (!LOOPBACK.has(host))
    return { error: `OLLAMA_HOST is ${raw}, which is not this machine; FlowBoard uses only Ollama on this machine (127.0.0.1, localhost or ::1)` };
  host = host === '::1' ? '[::1]' : host;
  return { scheme, host, port, url: `${scheme}://${host}:${port}` };
}

const listOf = (dataDir: string) => join(dataDir, 'ollama-models.json');

/** The models as last listed, for checks that must not wait on Ollama (the designer's); null before the first list. */
export function readOllamaList(dataDir: string): OllamaModel[] | null {
  try {
    const f = listOf(dataDir);
    const list = isFile(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { models?: unknown }).models : undefined;
    return Array.isArray(list) ? (list as OllamaModel[]) : null;
  } catch {
    return null; // ponytail: a file that does not parse counts as absent; only this module writes it
  }
}

type Tag = { name?: unknown; size?: unknown; remote_host?: unknown; remote_model?: unknown; capabilities?: unknown; details?: { context_length?: unknown } };
type Show = { parameters?: unknown; capabilities?: unknown; model_info?: Record<string, unknown> };
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);

/**
 * A cloud model runs on ollama.com, not here: the API marks it with `remote_host`/`remote_model`, and its tag is
 * `cloud` or ends in `-cloud` (gemma4:cloud, gpt-oss:120b-cloud). Either one leaves it out.
 */
export const isCloud = (t: Tag) => !!t.remote_host || !!t.remote_model || /(^|-)cloud$/.test(String(t.name).split(':')[1] ?? '');

/**
 * /api/tags, each model's /api/show and /api/ps as the list FlowBoard offers: local models that take tools only,
 * each with the window it runs with (see the top of this file). `contextLength` is OLLAMA_CONTEXT_LENGTH.
 */
export function toOllamaModels(tags: unknown, shows: Record<string, Show>, ps: unknown, contextLength?: string): OllamaModel[] {
  const models = (tags as { models?: unknown }).models;
  if (!Array.isArray(models)) throw new Error('Ollama sent no model list');
  const loaded = new Map(((ps as { models?: { name?: string; context_length?: unknown }[] })?.models ?? []).map((m) => [m.name, num(m.context_length)]));
  const fromEnv = /^\d+$/.test(contextLength ?? '') ? num(Number(contextLength)) : null;
  const out: OllamaModel[] = [];
  for (const t of models as Tag[]) {
    if (typeof t.name !== 'string' || isCloud(t)) continue;
    const show = shows[t.name] ?? {};
    const caps = Array.isArray(t.capabilities) ? t.capabilities : Array.isArray(show.capabilities) ? show.capabilities : [];
    if (!caps.includes('tools')) continue;
    const numCtx = num(Number(/^num_ctx\s+(\d+)/m.exec(String(show.parameters ?? ''))?.[1]));
    const [context, contextFrom] = numCtx ? [numCtx, 'num_ctx' as const] : fromEnv ? [fromEnv, 'OLLAMA_CONTEXT_LENGTH' as const] : loaded.get(t.name) ? [loaded.get(t.name)!, 'loaded' as const] : [null, null];
    const info = Object.entries(show.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1];
    out.push({ id: `ollama/${t.name}`, name: t.name, free: true, price: { in: 0, out: 0 }, local: true, context, contextFrom, maxContext: num(t.details?.context_length) ?? num(info), size: num(t.size) ?? 0 });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Ollama as the pages and a run's check see it: `error` says why it cannot be used now; `models` null then. */
export interface OllamaState { address: string; version: string | null; models: OllamaModel[] | null; error?: string }

/** Asks Ollama for its models and keeps the list for the designer's check. Never throws. */
export async function refreshOllama(dataDir: string, env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Promise<OllamaState> {
  const addr = ollamaAddress(env);
  if ('error' in addr) return { address: env.OLLAMA_HOST ?? '', version: null, models: null, error: addr.error };
  const get = async (path: string, body?: object) => {
    const res = await fetchFn(`${addr.url}${path}`, { ...(body && { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  try {
    const { version } = (await get('/api/version')) as { version?: string };
    const tags = await get('/api/tags');
    const names = ((tags as { models?: Tag[] }).models ?? []).flatMap((t) => (typeof t.name === 'string' && !isCloud(t) ? [t.name] : []));
    const shows = Object.fromEntries(await Promise.all(names.map(async (n) => [n, (await get('/api/show', { model: n }).catch(() => ({}))) as Show])));
    const ps = await get('/api/ps').catch(() => ({}));
    const models = toOllamaModels(tags, shows, ps, env.OLLAMA_CONTEXT_LENGTH);
    writeJsonFile(listOf(dataDir), { fetchedAt: new Date().toISOString(), models });
    return { address: addr.url, version: version ?? null, models };
  } catch (e) {
    // Nothing listening, or too slow, needs no more words; an odd answer is worth showing.
    const why = e instanceof TypeError || (e as Error).name === 'TimeoutError' ? '' : ` (${(e as Error).message})`;
    return { address: addr.url, version: null, models: null, error: `Ollama does not answer on ${addr.url}${why}; start it, then run again` };
  }
}

/** A run-start state as the checks take it: `down` refuses every local model. */
export const localModels = (s: OllamaState): LocalModels => ({ models: s.models, ...(s.error && { down: s.error }) });

/**
 * OpenCode's config for a step on `id`, to merge as a native capability pack: the `ollama` provider naming only that
 * model. `hostName` is how the step's process reaches this machine (`ExecHost.hostName`); absent, it runs here.
 * The window OpenCode plans for is the one Ollama runs, else the model's maximum.
 */
export function ollamaConfig(id: string, list: OllamaModel[] | null, env: NodeJS.ProcessEnv = process.env, hostName?: string): Record<string, unknown> {
  const addr = ollamaAddress(env);
  if ('error' in addr) throw new Error(addr.error);
  const name = id.slice('ollama/'.length);
  const m = list?.find((x) => x.id === id);
  const context = m?.context ?? m?.maxContext;
  const model = { name, ...(context && { limit: { context, output: OUTPUT_TOKENS } }) };
  const baseURL = `${addr.scheme}://${hostName ?? addr.host}:${addr.port}/v1`;
  return { provider: { ollama: { npm: '@ai-sdk/openai-compatible', name: 'Ollama', options: { baseURL }, models: { [name]: model } } } };
}
