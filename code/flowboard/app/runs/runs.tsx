'use client';
/** The runs screen: every run-flow run, newest first, and the picked one in full. */
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LIVE, runQuery, runsQuery } from './api.ts';
import type { RunStatus } from './api.ts';
import { useState } from 'react';
import { NewRun } from './new-run.tsx';
import { RunActions, RunView } from './run-view.tsx';

const PILL: Record<RunStatus, string> = {
  starting: '● starting',
  running: '● running',
  waiting: '‖ waiting on you',
  paused: '‖ paused',
  done: '✓ done',
  failed: '✕ failed',
};
const tone = (s: RunStatus) => (s === 'waiting' || s === 'paused' ? 'wait' : s === 'failed' ? 'bad' : LIVE.has(s) ? 'live' : 'done');

export function Runs() {
  const runs = useQuery(runsQuery);
  const params = useSearchParams();
  const router = useRouter();
  const picked = runs.data?.find((r) => r.name === params.get('run')) ?? runs.data?.[0];
  const run = useQuery({ ...runQuery(picked?.name ?? '', true), enabled: !!picked });
  // `?new=<flow>` (the designer's Run button) opens the New run sheet on that flow.
  const [creating, setCreating] = useState<string | boolean>(() => params.get('new') ?? false);
  const show = (name: string) => router.replace(`/runs?run=${encodeURIComponent(name)}`);
  const closeSheet = () => {
    setCreating(false);
    if (params.has('new')) router.replace('/runs');
  };

  return (
    <div className="fd">
      <header className="topbar">
        <div className="brand">
          flowboard<em>/</em>
          <span>runs</span>
        </div>
        {picked && (
          <span className="vchip">
            <b>{picked.flow || picked.name}</b>
            <span className="lbl ident">runs/{picked.name}</span>
            <span className={`rv-pill ${tone(run.data?.status ?? picked.status)}`}>{PILL[run.data?.status ?? picked.status]}</span>
          </span>
        )}
        <span className="sp" />
        {run.data && <RunActions run={run.data} />}
        <button type="button" className="act primary" onClick={() => setCreating(true)}>
          + New run
        </button>
        <Link className="act" href="/flows">
          Flows
        </Link>
        <Link className="act" href="/docs">
          Docs
        </Link>
      </header>
      <div className="body">
        <aside className="pane rn-list">
          <div className="ph">
            <span className="lbl">runs</span>
            <span className="sp" />
            <span className="lbl">{runs.data?.length ?? 0}</span>
          </div>
          {runs.isError && <div className="in-empty">{runs.error.message}</div>}
          {runs.data?.length === 0 && <div className="in-empty">No runs yet. Start one with + New run.</div>}
          {runs.data?.map((r) => (
            <button key={r.name} type="button" className="rn-row" aria-current={r.name === picked?.name} onClick={() => show(r.name)}>
              <i className={`lg-dot ${tone(r.status)}`} />
              <b>{r.flow || '?'}</b>
              <small>
                {r.name.slice(0, 19).replace('T', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2')} · {r.status}
              </small>
            </button>
          ))}
        </aside>
        <main className="pane rn-main">{picked && <RunView key={picked.name} name={picked.name} />}</main>
      </div>
      {creating !== false && <NewRun flow={typeof creating === 'string' ? creating : undefined} onStarted={show} onClose={closeSheet} />}
    </div>
  );
}
