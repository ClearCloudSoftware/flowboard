'use client';
/** One run's log: a tab per step run, its adapter's events as they come. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsQuery } from '../flows/api.ts';
import { lineOf } from './log-lines.ts';

export function RunLog({ run, live }: { run: string; live: boolean }) {
  const [tab, setTab] = useState<number>();
  const [follow, setFollow] = useState(true);
  const logs = useQuery(logsQuery(run, live));
  const body = useRef<HTMLDivElement>(null);

  const shown = logs.data?.find((l) => l.run === tab) ?? logs.data?.at(-1);
  const lines = (shown?.lines ?? []).map(lineOf).filter((l) => l !== null);

  useEffect(() => {
    if (follow && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [follow, lines.length, shown?.run]);

  return (
    <section className="lg open" aria-label="Agent logs">
      <div className="lg-h">
        <span className="lg-tabs" role="tablist">
          {logs.data?.map((l) => (
            <button key={l.run} type="button" role="tab" aria-selected={l.run === shown?.run} onClick={() => setTab(l.run)}>
              <i className={`lg-dot ${dot(l.lines)}`} />
              {l.step}
              {logs.data!.filter((x) => x.step === l.step).length > 1 && <small>#{l.run}</small>}
            </button>
          ))}
        </span>
        <span className="sp" />
        <label className="check lg-f">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow
        </label>
      </div>
      <div className="lg-b" ref={body} onWheel={(e) => e.deltaY < 0 && setFollow(false)}>
        {logs.isError ? (
          <div className="in-empty">{logs.error.message}</div>
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
    </section>
  );
}

/** A tab's mark: running until its log has a result, then how it ended. */
function dot(lines: Record<string, unknown>[]) {
  const end = lines.findLast((l) => l.kind === 'result');
  if (!end) return 'live';
  return lineOf(end)?.tone === 'bad' ? 'bad' : 'done';
}
