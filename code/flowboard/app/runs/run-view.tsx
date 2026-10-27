'use client';
/** One run (docs/mockups/run-viewer.html): its summary, flow bar, what waits on you, its log, and the side panel. */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Question } from '../../packages/core/src/hitl/question.ts';
import type { PageAsk } from '../../packages/cli/src/ask/page.ts';
import { answerRun, artifactQuery, LIVE, logsQuery, resumeRun, runQuery, stopRun } from './api.ts';
import type { RunDetail, StepLog } from './api.ts';
import { entriesOf, totalsOf } from './log-lines.ts';
import type { Entry, Filter, ToolEntry } from './log-lines.ts';

const usd = (n: number | null | undefined) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '—');
const span = (from?: string, to?: string) => {
  if (!from) return '—';
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
/** A step's cell, from its engine state. */
const CELL: Record<string, string> = { pending: 'pending', running: 'running', awaiting_approval: 'gate', done: 'done', failed: 'fail', skipped: 'pending' };
const stepOfAsk = (a: PageAsk) => /^-- (\S+) asks:/.exec(a.heading)?.[1] ?? /^(\S+):/.exec(a.questions[0]?.prompt ?? '')?.[1];
const isGate = (a: PageAsk) => a.questions[0]?.id === 'decision';

export function RunView({ name }: { name: string }) {
  const runs = useQuery(runQuery(name, true));
  const run = runs.data;
  const live = !!run && LIVE.has(run.status);
  const logs = useQuery({ ...logsQuery(name, live), enabled: !!run });
  const [tab, setTab] = useState<number>();
  const shown = logs.data?.find((l) => l.run === tab) ?? logs.data?.at(-1);
  const pick = (step: string) => {
    const last = logs.data?.findLast((l) => l.step === step);
    if (last) setTab(last.run);
  };

  if (runs.isPending) return <div className="in-empty">Loading…</div>;
  if (!run) return <div className="in-empty">{runs.error?.message ?? 'No such run.'}</div>;
  const asks = run.asks;
  const gates = asks.filter(isGate);
  const questions = asks.filter((a) => !isGate(a));
  const lost = runs.isError || logs.isError;
  const waitingOnYou = run.steps.filter((s) => s.state === 'awaiting_approval');

  return (
    <div className="rv">
      <Summary run={run} logs={logs.data ?? []} />
      <nav className="rv-bar" aria-label="Steps">
        {run.steps.map((s) => {
          const runsOf = run.runs.filter((r) => r.step === s.name);
          const last = runsOf.at(-1);
          const tip = [s.state.replace('_', ' '), last && span(last.startedAt, last.endedAt), last && usd(runsOf.reduce((n, r) => n + (r.costUsd ?? 0), 0)), s.gate?.reason].filter(Boolean).join(' · ');
          return (
            <button key={s.name} type="button" className={`rv-cell ${CELL[s.state] ?? 'pending'}${shown?.step === s.name ? ' sel' : ''}`} title={tip} onClick={() => pick(s.name)}>
              {s.name}
              {s.attempts > 1 && <span className="n">×{s.attempts}</span>}
              <small>{s.kind === 'shell' ? 'shell' : s.model}{last ? ` · ${span(last.startedAt, last.endedAt)} · ${usd(runsOf.reduce((n, r) => n + (r.costUsd ?? 0), 0))}` : ` · ${s.state === 'pending' ? 'pending' : s.state.replace('_', ' ')}`}</small>
            </button>
          );
        })}
      </nav>
      {lost && <div className="rv-banner lost">⋯ lost the connection to the run; retrying, and the log catches up when it is back</div>}
      {gates.map((a) => (
        <Gate key={a.id} run={run} ask={a} />
      ))}
      {!run.page && waitingOnYou.length > 0 && run.status !== 'paused' && (
        <div className="rv-banner">
          <b>{waitingOnYou.map((s) => s.name).join(', ')}</b> needs a decision; this run takes them in its terminal only. Start runs with <code>--page</code> to decide here.
        </div>
      )}
      {run.status === 'paused' && waitingOnYou.length > 0 && (
        <div className="rv-banner">
          <b>{waitingOnYou.map((s) => s.name).join(', ')}</b> waits for a decision; resume the run to take it.
        </div>
      )}
      <div className="rv-body">
        <Log run={run} logs={logs.data} shown={shown} setTab={setTab} questions={questions} live={live} />
        <Side run={run} />
      </div>
    </div>
  );
}

function Summary({ run, logs }: { run: RunDetail; logs: StepLog[] }) {
  const agentMs = run.runs.reduce((n, r) => n + (r.startedAt ? (r.endedAt ? Date.parse(r.endedAt) : Date.now()) - Date.parse(r.startedAt) : 0), 0);
  const retries = run.runs.filter((r) => r.attempt > 1).length;
  const started = logs[0]?.lines[0]?.at as string | undefined;
  return (
    <section className="rv-sum">
      <div>
        <span className="lbl">bill</span>
        <b>{usd(run.spentUsd)}</b>
      </div>
      <div>
        <span className="lbl">agent time</span>
        <b>{span(new Date(0).toISOString(), new Date(agentMs).toISOString())}</b>
      </div>
      <div>
        <span className="lbl">started</span>
        <b>{started ? new Date(started).toLocaleTimeString() : '—'}</b>
      </div>
      <div>
        <span className="lbl">retries</span>
        <b>{retries}</b>
      </div>
      <div>
        <span className="lbl">burned on redone work</span>
        <b className={run.wastedUsd ? 'wasted' : ''}>{usd(run.wastedUsd)}</b>
      </div>
      <div className="rv-budget">
        <span className="lbl">budget</span>
        <b>{run.budgetUsd > 0 ? `${usd(run.spentUsd)} of ${usd(run.budgetUsd)}` : 'no ceiling'}</b>
        {run.budgetUsd > 0 && (
          <i className="rv-meter">
            <i style={{ width: `${Math.min(100, (run.spentUsd / run.budgetUsd) * 100)}%` }} />
          </i>
        )}
      </div>
    </section>
  );
}

/** Answers a question batch through the page: the run's host picks the answer up. */
function useAnswer(run: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answers }: { id: string; answers: Record<string, unknown> }) => answerRun(run, id, answers),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['run', run] }),
  });
}

const DECISION: Record<string, { label: string; tone: string; key?: string }> = {
  approve: { label: 'Approve', tone: 'pri', key: 'a' },
  reject: { label: 'Send back', tone: 'wait', key: 'r' },
  retry: { label: 'Retry', tone: '' },
  fail: { label: 'Fail', tone: 'danger' },
};

function Gate({ run, ask }: { run: RunDetail; ask: PageAsk }) {
  const [note, setNote] = useState('');
  const answer = useAnswer(run.name);
  const [decision, noteQ] = ask.questions;
  const step = stepOfAsk(ask);
  const instance = run.steps.find((s) => s.name === step);
  const kind = instance?.gate?.kind;
  const evidence = instance?.gate?.evidence ?? [];
  const decide = (value: string) => answer.mutate({ id: ask.id, answers: { decision: value, ...(noteQ && { [noteQ.id]: note || null }) } });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const hit = decision.options?.find((o) => DECISION[o.value]?.key === e.key);
      if (hit) decide(hit.value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className={`rv-banner${kind === 'run_failed' || kind === 'escalation' ? ' bad' : ''}`}>
      <b>{step}</b>
      <span>{decision.prompt.replace(/^\S+: /, '')}</span>
      {evidence.length > 0 && <span className="lbl">reads {evidence.join(', ')}</span>}
      <span className="sp" />
      {noteQ && <input className="rv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'verdict' ? 'reason, for the next run' : 'note for the next run'} aria-label={noteQ.prompt} />}
      {decision.options?.map((o) => (
        <button key={o.value} type="button" className={`act ${DECISION[o.value]?.tone ?? ''}`} disabled={answer.isPending} onClick={() => decide(o.value)}>
          {DECISION[o.value]?.label ?? o.label}
          {DECISION[o.value]?.key && <span className="kbd">{DECISION[o.value]!.key}</span>}
        </button>
      ))}
      {answer.error && <em className="in-err">{answer.error.message}</em>}
    </div>
  );
}

const FILTERS: { key: Filter | 'tools' | 'raw'; label: string }[] = [
  { key: 'said', label: 'said' },
  { key: 'tools', label: 'tools' },
  { key: 'thinking', label: 'thinking' },
  { key: 'errors', label: 'errors' },
  { key: 'raw', label: 'raw' },
];

function Log({ run, logs, shown, setTab, questions, live }: { run: RunDetail; logs?: StepLog[]; shown?: StepLog; setTab: (n: number) => void; questions: PageAsk[]; live: boolean }) {
  const [follow, setFollow] = useState(true);
  const [on, setOn] = useState<Set<string>>(new Set(['said', 'tools', 'errors', 'other']));
  const body = useRef<HTMLDivElement>(null);
  const lines = shown?.lines ?? [];
  const entries = entriesOf(lines);
  const step = run.steps.find((s) => s.name === shown?.step);
  const record = run.runs.find((r) => r.id === shown?.run);
  const totals = totalsOf(lines);
  const mine = questions.filter((q) => stepOfAsk(q) === shown?.step);
  const toggle = (k: string) => setOn((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const visible = (e: Entry) => (e.kind === 'line' ? on.has(e.filter) || (e.filter === 'other' && !on.has('raw')) : on.has('tools') || (e.kind === 'tool' && e.ok === false && on.has('errors')));

  useEffect(() => {
    if (follow && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [follow, lines.length, shown?.run, mine.length]);

  return (
    <section className="lg open rv-log" aria-label="Agent logs">
      <div className="lg-h">
        <span className="lg-tabs" role="tablist">
          {logs?.map((l) => (
            <button key={l.run} type="button" role="tab" aria-selected={l.run === shown?.run} onClick={() => setTab(l.run)}>
              <i className={`lg-dot ${dot(l, run)}`} />
              {l.step}
              {logs.filter((x) => x.step === l.step).length > 1 && <small>#{l.run}</small>}
            </button>
          ))}
        </span>
        <span className="sp" />
        <span className="rv-filters">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={on.has(f.key)} onClick={() => toggle(f.key)}>
              {f.label}
            </button>
          ))}
        </span>
        <label className="check lg-f">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow
        </label>
      </div>
      {step && (
        <div className="rv-chips">
          <span className="chip">{step.kind === 'shell' ? `shell · ${step.command}` : [step.adapter, step.model, step.effort].filter(Boolean).join(' · ')}</span>
          {record && <span className="chip">attempt {record.attempt} of {step.maxAttempts}</span>}
          {record?.outcome && <span className={`chip ${record.outcome === 'fail' ? 'bad' : 'out'}`}>{record.outcome}</span>}
          {record?.wasted && <span className="chip bad">wasted</span>}
          {record?.error && <span className="chip bad">{record.error}</span>}
          {step.gate?.note && <span className="chip back">← {step.gate.note}</span>}
        </div>
      )}
      <div className="lg-b" ref={body} onWheel={(e) => e.deltaY < 0 && setFollow(false)}>
        {!shown ? (
          <div className="in-empty">{logs ? 'This run has no step logs yet.' : 'Loading…'}</div>
        ) : on.has('raw') ? (
          <pre className="rv-raw">{lines.map((l) => JSON.stringify(l)).join('\n')}</pre>
        ) : (
          entries.filter(visible).map((e, i) => <EntryView key={i} e={e} />)
        )}
        {mine.map((q) => (
          <Ask key={q.id} run={run.name} ask={q} />
        ))}
      </div>
      <div className="rv-foot">
        <span>
          <span className="lbl">elapsed</span> <b>{span(totals.startedAt, totals.endedAt)}</b>
        </span>
        <span>
          <span className="lbl">turns</span> <b>{totals.turns}</b>
        </span>
        <span>
          <span className="lbl">tokens</span> <b>{kTokens(totals.input)} in · {kTokens(totals.output)} out</b>
        </span>
        <span>
          <span className="lbl">cost</span> <b>{usd(totals.costUsd ?? record?.costUsd)}</b>
          {totals.costUsd === undefined && live && !totals.endedAt && <span className="lbl"> reported at the result</span>}
        </span>
      </div>
    </section>
  );
}

function dot(l: StepLog, run: RunDetail) {
  const r = run.runs.find((x) => x.id === l.run);
  if (r?.error || r?.outcome === 'fail') return 'bad';
  if (!l.lines.some((x) => x.kind === 'result')) return run.steps.find((s) => s.name === l.step)?.state === 'awaiting_approval' ? 'wait' : 'live';
  return 'done';
}

function EntryView({ e }: { e: Entry }) {
  const [open, setOpen] = useState(false);
  if (e.kind === 'line')
    return (
      <div className={`lg-l ${e.line.tone ?? ''} ${e.filter}`}>
        <span>{e.line.at}</span>
        <span>{e.line.type}</span>
        <span>{e.line.text}</span>
      </div>
    );
  if (e.kind === 'fold')
    return open ? (
      <>
        <button type="button" className="rv-fold" onClick={() => setOpen(false)}>
          ▾ {e.tools.length} tool calls
        </button>
        {e.tools.map((t, i) => (
          <Tool key={i} t={t} />
        ))}
      </>
    ) : (
      <button type="button" className="rv-fold" onClick={() => setOpen(true)}>
        ▸ {e.tools.length} tool calls — {[...new Set(e.tools.map((t) => t.name))].join(', ')}
        {e.tools.some((t) => t.ok === false) && <span className="bad"> · {e.tools.filter((t) => t.ok === false).length} failed</span>}
      </button>
    );
  return <Tool t={e} />;
}

const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function Tool({ t }: { t: ToolEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rv-tool${t.ok === false ? ' bad' : ''}`}>
      <button type="button" className="h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="t">{t.at}</span>
        {open ? '▾' : '▸'} <b>{t.name}</b>
        <span className="s">{t.summary.replace(new RegExp(`^${t.name}\\s*`), '')}</span>
        <span className="r">{t.ok === undefined ? '⋯' : t.ok ? '✓' : '✗'}</span>
      </button>
      {open && (
        <>
          <div className="sub">input</div>
          <pre>{text(t.input)}</pre>
          {t.output !== undefined && (
            <>
              <div className="sub">result</div>
              <pre>{text(t.output)}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** A question an agent asked: answered here, or in the run's terminal, whichever comes first. */
function Ask({ run, ask }: { run: string; ask: PageAsk }) {
  const answer = useAnswer(run);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const set = (q: Question, v: unknown) => setValues((s) => ({ ...s, [q.id]: v }));
  return (
    <form
      className="rv-ask"
      onSubmit={(e) => {
        e.preventDefault();
        answer.mutate({ id: ask.id, answers: values });
      }}
    >
      <div className="h">
        <b>asked you</b> · {new Date(ask.at).toLocaleTimeString()} · the step&rsquo;s clock waits while it does
      </div>
      {ask.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.prompt}</legend>
          {q.help && <p className="lbl">{q.help}</p>}
          {q.kind === 'single_select' || q.kind === 'multi_select' ? (
            <div className="opts">
              {q.options?.map((o, i) => {
                const v = values[q.id];
                const on = q.kind === 'multi_select' ? Array.isArray(v) && v.includes(o.value) : v === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`act${on ? ' pri' : ''}`}
                    onClick={() => set(q, q.kind === 'multi_select' ? (on ? (v as string[]).filter((x) => x !== o.value) : [...((v as string[]) ?? []), o.value]) : o.value)}
                  >
                    {i + 1} · {o.label}
                  </button>
                );
              })}
            </div>
          ) : q.kind === 'yes_no' ? (
            <div className="opts">
              {[true, false].map((b) => (
                <button key={String(b)} type="button" className={`act${values[q.id] === b ? ' pri' : ''}`} onClick={() => set(q, b)}>
                  {b ? 'yes' : 'no'}
                </button>
              ))}
            </div>
          ) : (
            <input type={q.kind === 'number' ? 'number' : 'text'} onChange={(e) => set(q, q.kind === 'number' ? Number(e.target.value) : e.target.value)} />
          )}
        </fieldset>
      ))}
      <div className="opts">
        <button type="submit" className="act pri" disabled={answer.isPending}>
          Answer
        </button>
        {answer.error && <em className="in-err">{answer.error.message}</em>}
      </div>
    </form>
  );
}

function Side({ run }: { run: RunDetail }) {
  const [open, setOpen] = useState<string>();
  const artifact = useQuery({ ...artifactQuery(run.name, open ?? ''), enabled: !!open && open !== 'patch' });
  const byStep = run.steps.map((s) => ({ s, cost: run.runs.filter((r) => r.step === s.name).reduce((n, r) => n + (r.costUsd ?? 0), 0), n: run.runs.filter((r) => r.step === s.name).length })).filter((x) => x.n);
  const failed = run.runs.filter((r) => r.error && r.error !== 'superseded' && r.error !== 'not launched');
  return (
    <aside className="rv-side">
      <div className="rv-sec">
        <h3>artifacts</h3>
        {run.artifacts.length === 0 && !run.patch && <p className="lbl">none yet</p>}
        {run.artifacts.map((a) => (
          <button key={a.type} type="button" className="rv-art" aria-expanded={open === a.type} onClick={() => setOpen(open === a.type ? undefined : a.type)}>
            <span className="ty">{a.type}</span>
            <small>
              {a.by ?? '?'} · {a.bytes < 1024 ? `${a.bytes} B` : `${(a.bytes / 1024).toFixed(1)} kB`}
            </small>
          </button>
        ))}
        {run.patch && (
          <button type="button" className="rv-art" aria-expanded={open === 'patch'} onClick={() => setOpen(open === 'patch' ? undefined : 'patch')}>
            <span className="ty">changes.patch</span>
            <small>{patchCounts(run.patch.text)}</small>
          </button>
        )}
        {open === 'patch' && run.patch && <Diff text={run.patch.text} cut={run.patch.cut} />}
        {open && open !== 'patch' && <pre className="rv-file">{artifact.data?.text ?? (artifact.isError ? artifact.error.message : 'Loading…')}</pre>}
      </div>
      <div className="rv-sec">
        <h3>spend</h3>
        <div className="rv-kv">
          <span>this run, so far</span>
          <span>{usd(run.spentUsd)}</span>
          {byStep.map(({ s, cost, n }) => (
            <span key={s.name} style={{ display: 'contents' }}>
              <span>
                {s.name}
                {n > 1 ? ` · ${n} runs` : ''}
              </span>
              <span>{usd(cost)}</span>
            </span>
          ))}
          <span>burned on redone work</span>
          <span className={run.wastedUsd ? 'w' : ''}>{usd(run.wastedUsd)}</span>
          <span>ceiling</span>
          <span>{run.budgetUsd > 0 ? usd(run.budgetUsd) : 'none'}</span>
        </div>
      </div>
      {failed.length > 0 && (
        <div className="rv-sec">
          <h3>failures</h3>
          {failed.map((r) => (
            <div key={r.id} className="rv-deny">
              <b>
                ✕ {r.step} #{r.attempt}
              </b>{' '}
              {r.error}
            </div>
          ))}
        </div>
      )}
      <div className="rv-sec">
        <h3>sandbox</h3>
        <p className="rv-post">{run.sandbox}</p>
      </div>
      <div className="rv-sec">
        <h3>run</h3>
        <div className="rv-kv">
          <span>folder</span>
          <span title={run.folder}>{run.folder.replace(/^\/Users\/[^/]+/, '~')}</span>
          <span>flow</span>
          <span>{run.flow} · pinned copy</span>
          <span>decisions</span>
          <span>{run.page ? 'here and in its terminal' : 'its terminal only'}</span>
        </div>
        <div className="rv-btns">
          <a className="act" href="/flows">
            Open the flow
          </a>
          <a className="act" href={`/api/runs/${encodeURIComponent(run.name)}/logs`} download={`${run.name}-events.json`}>
            ↓ events
          </a>
        </div>
      </div>
    </aside>
  );
}

const patchCounts = (text: string) => {
  const lines = text.split('\n');
  const add = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const del = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  return `+${add} −${del}`;
};

function Diff({ text, cut }: { text: string; cut: boolean }) {
  return (
    <pre className="rv-diff">
      {text.split('\n').map((l, i) => (
        <span key={i} className={l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') ? 'f' : l.startsWith('@@') ? 'h' : l.startsWith('+') ? 'a' : l.startsWith('-') ? 'd' : ''}>
          {l || ' '}
          {'\n'}
        </span>
      ))}
      {cut && <span className="h">… the patch is longer; see changes.patch in the run folder</span>}
    </pre>
  );
}

/** The top bar's run actions: stop a live run, resume a paused one (optionally with a bigger budget). */
export function RunActions({ run }: { run: RunDetail }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['run', run.name] });
  const stop = useMutation({ mutationFn: () => stopRun(run.name), onSuccess: refresh });
  const resume = useMutation({ mutationFn: (budget?: number) => resumeRun(run.name, budget), onSuccess: refresh });
  const error = stop.error?.message ?? resume.error?.message;
  return (
    <>
      {error && <em className="in-err">{error}</em>}
      {run.status === 'paused' && (
        <>
          <button type="button" className="act" disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
            Resume
          </button>
          <button
            type="button"
            className="act"
            disabled={resume.isPending}
            onClick={() => {
              const v = window.prompt(`New budget for the whole run, in dollars (spent so far: ${usd(run.spentUsd)}; 0 for no ceiling)`, String(Math.max(run.budgetUsd, run.spentUsd) * 2 || 5));
              if (v !== null && Number.isFinite(Number(v)) && Number(v) >= 0) resume.mutate(Number(v));
            }}
          >
            Resume with more budget…
          </button>
        </>
      )}
      {LIVE.has(run.status) && (
        <button type="button" className="act danger" disabled={stop.isPending} onClick={() => window.confirm('Stop this run? --resume or Resume continues it.') && stop.mutate()}>
          Stop run
        </button>
      )}
    </>
  );
}
