/** A step log's JSONL lines as the drawer shows them: a time, a type, one line of text, and a tone. */
export interface Line { at: string; type: string; text: string; tone?: 'tool' | 'ok' | 'bad' | 'quiet' | 'cost' }

const time = (at: unknown) => (typeof at === 'string' ? at.slice(11, 19) : '');
const short = (v: unknown, n = 160) => {
  const s = (typeof v === 'string' ? v : JSON.stringify(v) ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const money = (u: number | undefined) => (typeof u === 'number' ? ` · $${u.toFixed(2)}` : '');

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
