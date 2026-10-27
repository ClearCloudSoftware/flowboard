'use client';
/** The log drawer under the canvas: a run of this flow, a tab per step run, its adapter's events as they come. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from '@tanstack/react-store';
import { logsQuery, runsQuery } from './api.ts';
import { editor } from './editor.ts';
import { lineOf } from './log-lines.ts';

const LIVE = new Set(['running', 'starting']);

export function Logs({ flow }: { flow: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>();
  const [tab, setTab] = useState<number>();
  const [follow, setFollow] = useState(true);
  const runs = useQuery(runsQuery(flow));
  const run = runs.data?.find((r) => r.name === picked) ?? runs.data?.[0];
  const live = !!run && LIVE.has(run.status);
  const logs = useQuery({ ...logsQuery(run?.name ?? '', live), enabled: open && !!run });
  const selected = useSelector(editor, (s) => (s.selection && 'step' in s.selection ? s.selection.step : undefined));
  const body = useRef<HTMLDivElement>(null);

  // A step picked on the canvas opens its latest run's tab.
  useEffect(() => {
    const last = logs.data?.filter((l) => l.step === selected).at(-1);
    if (last) setTab(last.run);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- not on every poll, or a tab you picked would jump back
  }, [selected, !!logs.data]);

  const shown = logs.data?.find((l) => l.run === tab) ?? logs.data?.at(-1);
  const lines = (shown?.lines ?? []).map(lineOf).filter((l) => l !== null);

  useEffect(() => {
    if (follow && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [follow, lines.length, shown?.run]);

  return (
    <section className={`lg${open ? ' open' : ''}`} aria-label="Agent logs">
      <div className="lg-h">
        <button type="button" className="lg-t" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} logs
        </button>
        {open && runs.data && runs.data.length > 0 && (
          <>
            <select value={run?.name} onChange={(e) => (setPicked(e.target.value), setTab(undefined))} aria-label="Run">
              {runs.data.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} · {r.status}
                </option>
              ))}
            </select>
            <span className="lg-tabs" role="tablist">
              {logs.data?.map((l) => (
                <button key={l.run} type="button" role="tab" aria-selected={l.run === shown?.run} onClick={() => setTab(l.run)}>
                  <i className={`lg-dot ${dot(l.lines)}`} />
                  {l.step}
                  {logs.data!.filter((x) => x.step === l.step).length > 1 && <small>#{l.run}</small>}
                </button>
              ))}
            </span>
          </>
        )}
        <span className="sp" />
        {open && (
          <label className="check lg-f">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow
          </label>
        )}
        {!open && run && <span className="lbl">{run.status === 'running' ? 'a run is going' : `last run ${run.status}`}</span>}
      </div>
      {open && (
        <div className="lg-b" ref={body} onWheel={(e) => e.deltaY < 0 && setFollow(false)}>
          {!runs.data?.length ? (
            <div className="in-empty">No runs of {flow} yet. Start one with pnpm run-flow; its steps&rsquo; logs show here as they run.</div>
          ) : !shown ? (
            <div className="in-empty">{logs.isPending ? 'Loading…' : 'This run has no step logs yet.'}</div>
          ) : (
            lines.map((l, i) => (
              <div key={i} className={`lg-l ${l.tone ?? ''}`}>
                <span>{l.at}</span>
                <span>{l.type}</span>
                <span>{l.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/** A tab's mark: running until its log has a result, then how it ended. */
function dot(lines: Record<string, unknown>[]) {
  const end = lines.findLast((l) => l.kind === 'result');
  if (!end) return 'live';
  return lineOf(end)?.tone === 'bad' ? 'bad' : 'done';
}
