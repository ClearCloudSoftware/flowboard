'use client';
/**
 * The System status section: the doctor's report (`/api/doctor`), checked in the app's own environment, grouped as
 * `pnpm lr-doctor` prints it. It runs when the page opens and on Check again, never on its own.
 */
import { useQuery } from '@tanstack/react-query';
import { Check as Copied, CircleCheck, CircleMinus, CircleX, Copy, type LucideIcon, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/loader';
import type { Check, DoctorReport, Status } from '../../packages/cli/src/doctor.ts';
import { GROUPS, summaryLine } from '../../packages/cli/src/doctor-view.ts';
import { doctorQuery } from '../projects/api.ts';
import { ErrorLine, Head } from './settings.tsx';

const MARK: Record<Status, { icon: LucideIcon; tone: string; name: string }> = {
  ok: { icon: CircleCheck, tone: 'text-run', name: 'ok' },
  warn: { icon: TriangleAlert, tone: 'text-wait', name: 'warning' },
  fail: { icon: CircleX, tone: 'text-fail', name: 'problem' },
  skip: { icon: CircleMinus, tone: 'text-muted-foreground', name: 'not checked' },
};

/** The fix's command or step, with a button that copies it. */
function Fix({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start gap-1.5">
      <code className="min-w-0 flex-1 bg-secondary px-2 py-1 font-mono text-[12px] whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</code>
      <Button variant="ghost" size="icon-xs" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the fix'} title={copied ? 'Copied' : 'Copy'}>
        {copied ? <Copied className="text-run" /> : <Copy />}
      </Button>
    </div>
  );
}

function Row({ c }: { c: Check }) {
  const { icon: Icon, tone, name } = MARK[c.status];
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-4 py-2.5 sm:grid-cols-[18px_120px_minmax(0,1fr)]">
      <Icon aria-label={name} className={`mt-px size-4 ${tone}`} strokeWidth={1.75} />
      <span className="font-sans font-medium">{c.label}</span>
      <div className="col-start-2 grid min-w-0 gap-1.5 sm:col-start-3">
        <p className={`m-0 [overflow-wrap:anywhere] ${c.status === 'skip' ? 'text-muted-foreground' : ''}`}>{c.detail}</p>
        {c.fix && c.status !== 'ok' && <Fix text={c.fix} />}
      </div>
    </li>
  );
}

function Report({ r, checking, again }: { r: DoctorReport; checking: boolean; again: () => void }) {
  const at = new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-2 border-l-[3px] px-3 py-2 text-xs ${r.summary.ready ? 'border-run bg-[var(--run-soft)]' : 'border-fail bg-[var(--fail-soft)]'}`}>
        <p className="m-0">
          <span className={`font-medium ${r.summary.ready ? 'text-run' : 'text-fail'}`}>{summaryLine(r.summary)}</span>
          <span className="text-[var(--ink-2)]"> · checked {at}, in the app’s environment</span>
        </p>
        <Button variant="outline" size="sm" onClick={again} disabled={checking}>
          <RefreshCw className={checking ? 'animate-spin' : ''} />
          Check again
        </Button>
      </div>
      {GROUPS.map(([group, title]) => {
        const checks = r.checks.filter((c) => c.group === group);
        if (!checks.length) return null;
        const needed = group !== 'core' && checks.find((c) => c.needed); // core is always needed
        return (
          <section key={group} aria-label={title} className="grid border border-border bg-card">
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
              <h3 className="m-0 font-sans text-sm font-semibold">{title}</h3>
              {needed && <p className="m-0 font-sans text-xs text-muted-foreground">needed: {needed.why}</p>}
            </header>
            <ul className="m-0 grid list-none divide-y divide-border p-0">
              {checks.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function StatusPage() {
  const { data, error, isPending, isFetching, refetch } = useQuery(doctorQuery);
  return (
    <>
      <Head title="System status">Can this machine run your projects now? The same checks as pnpm lr-doctor, run in the app’s own environment.</Head>
      <ErrorLine error={error} />
      {isPending && !error && <Loader label="Checking this machine…" />}
      {data && <Report r={data} checking={isFetching} again={() => void refetch()} />}
      {error && !data && (
        <div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            Check again
          </Button>
        </div>
      )}
    </>
  );
}
