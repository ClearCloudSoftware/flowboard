'use client';
/** The runs screen: every run-flow run, newest first, and the log of the one picked. */
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { runsQuery } from '../flows/api.ts';
import { RunLog } from './run-log.tsx';

const LIVE = new Set(['running', 'starting']);

export function Runs() {
  const runs = useQuery(runsQuery);
  const params = useSearchParams();
  const router = useRouter();
  const run = runs.data?.find((r) => r.name === params.get('run')) ?? runs.data?.[0];

  return (
    <div className="fd">
      <header className="topbar">
        <div className="brand">
          flowboard<em>/</em>
          <span>runs</span>
        </div>
        {run && (
          <span className="vchip">
            <b>{run.flow || run.name}</b>
            <span className="lbl ident">runs/{run.name}</span>
            <span className="lbl">{run.status}</span>
          </span>
        )}
        <span className="sp" />
        <Link className="act" href="/flows">
          Flows
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
          {runs.data?.length === 0 && <div className="in-empty">No runs yet. Start one with pnpm run-flow in the app&rsquo;s folder; it shows here as it runs.</div>}
          {runs.data?.map((r) => (
            <button key={r.name} type="button" className="rn-row" aria-current={r.name === run?.name} onClick={() => router.replace(`/runs?run=${encodeURIComponent(r.name)}`)}>
              <i className={`lg-dot ${LIVE.has(r.status) ? 'live' : r.status === 'failed' ? 'bad' : 'done'}`} />
              <b>{r.flow || '?'}</b>
              <small>
                {r.name.slice(0, 19).replace('T', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2')} · {r.status}
              </small>
            </button>
          ))}
        </aside>
        <main className="pane rn-log">{run && <RunLog key={run.name} run={run.name} live={LIVE.has(run.status)} />}</main>
      </div>
    </div>
  );
}
