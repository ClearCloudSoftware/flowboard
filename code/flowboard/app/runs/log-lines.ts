/** A step log's JSONL lines as the drawer shows them: a time, a type, one line of text, and a tone. */
export interface Line { at: string; type: string; text: string; tone?: 'tool' | 'ok' | 'bad' | 'quiet' | 'cost' }

/** A log line's time, as this machine's clock shows it, like the rest of the page. */
const time = (at: unknown) => {
  const d = typeof at === 'string' ? new Date(at) : undefined;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const short = (v: unknown, n = 160) => {
  const s = (typeof v === 'string' ? v : JSON.stringify(v) ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
/** Dollars; below a cent, to the tenth of a cent, so a cheap model's run does not read as free. */
export const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const money = (u: number | undefined) => (typeof u === 'number' ? ` · ${usd(u)}` : '');

/** One log line, or null for the bookkeeping the drawer leaves out (pids). */
export function lineOf(l: Record<string, unknown>): Line | null {
  const at = time(l.at);
  const e = (l.event ?? {}) as Record<string, any>;
  switch (l.kind) {
    case 'start':
      return { at, type: 'start', text: [l.adapter ?? (l.command ? 'shell' : ''), l.attempt && `attempt ${l.attempt}`, typeof l.command === 'string' && l.command].filter(Boolean).join(' · '), tone: 'quiet' };
    case 'pid':
      return null;
    case 'result': {
      const r = (l.result ?? {}) as Record<string, any>;
      const failed = l.error || r.error || (typeof l.exitCode === 'number' && l.exitCode !== 0) || r.outcome === 'fail';
      const what = [r.outcome, typeof l.exitCode === 'number' ? `exit ${l.exitCode}` : typeof r.exitCode === 'number' && `exit ${r.exitCode}`, l.error ?? r.error].filter(Boolean).join(' · ');
      return { at, type: failed ? '✗ end' : '✓ end', text: (what || 'done') + money(r.usage?.costUsd), tone: failed ? 'bad' : 'ok' };
    }
    case 'event':
      switch (e.type) {
        case 'assistant_text':
          return { at, type: 'text', text: short(e.text, 400) };
        case 'thinking':
          return { at, type: 'thinking', text: short(e.text), tone: 'quiet' };
        case 'tool_use':
          return { at, type: 'tool', text: e.summary || `${e.name} ${short(e.input, 100)}`, tone: 'tool' };
        case 'tool_result':
          return { at, type: e.ok ? '✓ result' : '✗ result', text: short(e.output), tone: e.ok ? 'ok' : 'bad' };
        case 'system':
          return { at, type: 'system', text: e.sessionId ? `session ${e.sessionId}` : 'started', tone: 'quiet' };
        case 'usage':
        case 'result': {
          const u = e.usage ?? {};
          const text = `${Math.round((u.input ?? 0) / 1000)}k in · ${((u.output ?? 0) / 1000).toFixed(1)}k out · ${u.numTurns ?? 0} turns${money(u.costUsd)}`;
          return { at, type: e.type, text: e.outcome ? `${e.outcome} · ${text}` : text, tone: 'cost' };
        }
        case 'error':
          return { at, type: 'error', text: short(e.message, 400), tone: 'bad' };
      }
  }
  return { at, type: String(l.kind ?? '?'), text: short(l), tone: 'quiet' };
}

/** A tool call with its result, when it has come. */
export interface ToolEntry { kind: 'tool'; at: string; name: string; summary: string; input: unknown; ok?: boolean; output?: unknown }
/** What the log shows, in order: a line, a tool call, or a fold of tool calls in a row. */
export type Entry = { kind: 'line'; line: Line; filter: Filter; raw: Record<string, unknown> } | ToolEntry | { kind: 'fold'; tools: ToolEntry[] };
export type Filter = 'said' | 'thinking' | 'errors' | 'other';

/** Tool calls in a row, past this many, fold into one line. */
export const FOLD_AT = 3;

/** A step log as entries: each tool call paired with its result, and a run of tool calls folded. */
export function entriesOf(lines: Record<string, unknown>[]): Entry[] {
  const out: Entry[] = [];
  let row: ToolEntry[] = [];
  const flush = () => {
    if (row.length > FOLD_AT) out.push({ kind: 'fold', tools: row });
    else out.push(...row);
    row = [];
  };
  for (const raw of lines) {
    const e = (raw.event ?? {}) as Record<string, any>;
    if (raw.kind === 'event' && e.type === 'tool_use') {
      row.push({ kind: 'tool', at: time(raw.at), name: String(e.name ?? 'tool'), summary: e.summary || `${e.name} ${short(e.input, 100)}`, input: e.input });
      continue;
    }
    if (raw.kind === 'event' && e.type === 'tool_result') {
      const open = row.findLast((t) => t.ok === undefined) ?? [...out].reverse().find((t): t is ToolEntry => t.kind === 'tool' && t.ok === undefined);
      if (open) Object.assign(open, { ok: !!e.ok, output: e.output });
      continue;
    }
    const line = lineOf(raw);
    if (!line) continue;
    // usage lines are running totals: the footer shows them, the log need not
    if (raw.kind === 'event' && e.type === 'usage') continue;
    flush();
    const filter: Filter = line.tone === 'bad' ? 'errors' : line.type === 'text' ? 'said' : line.type === 'thinking' ? 'thinking' : 'other';
    out.push({ kind: 'line', line, filter, raw });
  }
  flush();
  return out;
}

/** A step log's totals for the footer: when it ran, its turns and tokens, and its cost once reported. */
export function totalsOf(lines: Record<string, unknown>[]) {
  const usages = lines.flatMap((l) => {
    const e = (l.event ?? {}) as Record<string, any>;
    return l.kind === 'event' && (e.type === 'usage' || e.type === 'result') && e.usage ? [e.usage] : [];
  });
  const end = lines.findLast((l) => l.kind === 'result');
  const u = (end?.result as Record<string, any> | undefined)?.usage ?? usages.at(-1) ?? {};
  return {
    startedAt: lines[0]?.at as string | undefined,
    endedAt: end?.at as string | undefined,
    turns: (u.numTurns as number) ?? 0,
    input: (u.input as number) ?? 0,
    output: (u.output as number) ?? 0,
    cacheRead: (u.cacheRead as number) ?? 0,
    cacheWrite: (u.cacheWrite as number) ?? 0,
    costUsd: u.costUsd as number | undefined,
  };
}

/**
 * USD per million tokens, input and output, by model family: Claude reports cost only on its result, so the
 * footer estimates it from tokens until then. Cache reads cost a tenth of input, cache writes a quarter more.
 * ponytail: list prices by family name; a model outside these gets no estimate.
 */
const PRICES: [RegExp, number, number][] = [
  [/haiku/, 1, 5],
  [/sonnet/, 3, 15],
  [/opus/, 5, 25],
];

export function estimateUsd(model: string | undefined, u: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): number | undefined {
  const price = PRICES.find(([re]) => re.test(model ?? ''));
  if (!price) return undefined;
  const [, inp, out] = price;
  return ((u.input + (u.cacheRead ?? 0) * 0.1 + (u.cacheWrite ?? 0) * 1.25) * inp + u.output * out) / 1e6;
}
