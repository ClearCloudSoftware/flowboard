'use client';
/**
 * The repo analyst's proposals for one project: its stack, its check command and the hosts its sandbox must reach,
 * each accepted here or left for later. Shared by the wizard's done screen and the project page. Nothing is applied
 * without a click: the analyst read an untrusted repo.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analysisAccepted } from '../../packages/cli/src/analysis.ts';
import { appSettingsQuery, projectsQuery, startAnalysis, updateProject, usd } from './api.ts';
import type { ProjectView } from './api.ts';
import { Warn } from './settings-pages.tsx';

const small = 'text-[11px] text-muted-foreground';
const head = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';
const runHref = (run: string) => `/runs?run=${encodeURIComponent(run)}`;

type Key = 'checkCommand' | 'networkHosts';

/** `wizard`: offers Later, which leaves a proposal for the project page. */
export function Analysis({ projectId, mode }: { projectId: string; mode: 'wizard' | 'project' }) {
  const queryClient = useQueryClient();
  // Polled fast while the analyst runs, so its proposals show as soon as it is done.
  const projects = useQuery({ ...projectsQuery, refetchInterval: (q) => (q.state.data?.find((x) => x.id === projectId)?.analysed?.status === 'running' ? 2000 : 10_000) });
  const app = useQuery(appSettingsQuery);
  const [later, setLater] = useState<Key[]>([]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['projects'] });
  const start = useMutation({ mutationFn: () => startAnalysis(projectId), onSuccess: refresh });
  const accept = useMutation({
    mutationFn: ({ p, key }: { p: ProjectView; key: Key }) => {
      const proposal = p.analysed!.proposal!;
      return key === 'checkCommand'
        ? updateProject(p.id, { checkCommand: proposal.checkCommand })
        : updateProject(p.id, { networkHosts: [...(p.networkHosts ?? []), ...proposal.networkHosts!.map((h) => h.host)] });
    },
    onSuccess: refresh,
  });
  const p = projects.data?.find((x) => x.id === projectId);
  if (!p) return null;
  const a = p.analysed;
  const again = (label: string) => (
    <Button size="sm" variant="outline" disabled={start.isPending} onClick={() => start.mutate()}>
      {start.isPending ? 'Starting…' : label}
    </Button>
  );
  const errors = [start.error, accept.error].filter(Boolean).map((e) => (
    <pre key={e!.message} role="alert" className="m-0 border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
      {e!.message}
    </pre>
  ));

  let body;
  if (!a) {
    const budget = app.data?.app.internal['repo-analyst'].budgetUsd;
    body = (
      <div className="flex flex-wrap items-center gap-3">
        {again('Analyse')}
        <span className={small}>reads the repo and proposes its check command and network hosts{budget ? `; about ${usd(budget)} at most` : ''}</span>
      </div>
    );
  } else if (a.status === 'running') {
    body = (
      <p className="m-0 text-xs">
        analysing…{' '}
        <Link href={runHref(a.run)} className="text-muted-foreground underline underline-offset-[3px]">
          its run
        </Link>
      </p>
    );
  } else if (a.status !== 'done') {
    body = (
      <div className="grid gap-2">
        <Warn>
          analysis {a.status}: {a.error}
        </Warn>
        <div className="flex items-center gap-3">
          {again('Analyse again')}
          <Link href={runHref(a.run)} className={`${small} underline underline-offset-[3px]`}>
            its run
          </Link>
        </div>
      </div>
    );
  } else {
    const pr = a.proposal!;
    const done = analysisAccepted(p);
    const row = (key: Key, title: string, value: React.ReactNode, why: React.ReactNode) =>
      later.includes(key) ? null : (
        <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
          <div className="grid min-w-0 gap-1">
            <b className="font-sans text-sm font-semibold">{title}</b>
            {value}
            <small className={small}>{why}</small>
          </div>
          {done[key] ? (
            <span className="text-[11px] text-run">accepted</span>
          ) : (
            <span className="flex gap-1.5">
              {mode === 'wizard' && (
                <Button size="sm" variant="ghost" onClick={() => setLater([...later, key])}>
                  Later
                </Button>
              )}
              <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate({ p, key })}>
                Accept
              </Button>
            </span>
          )}
        </div>
      );
    const nothing = (what: string) => (
      <div className="border-b border-border px-3 py-2.5 last:border-b-0">
        <b className="font-sans text-sm font-semibold">{what}</b>
        <small className={`block ${small}`}>nothing to go on{pr.notes ? `: ${pr.notes}` : ''}. Set one on the project page.</small>
      </div>
    );
    const custom = pr.networkHosts?.filter((h) => h.custom) ?? [];
    body = (
      <div className="grid gap-2">
        {pr.stack && (
          <div className="flex flex-wrap gap-1.5">
            {pr.stack.map((s) => (
              <span key={s} className="border border-input px-1.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="border border-border">
          {pr.checkCommand
            ? row('checkCommand', 'Check command', <code className="font-mono text-xs [overflow-wrap:anywhere]">{pr.checkCommand}</code>, `from ${pr.evidence.checkCommand.join(', ') || 'the repo'}; written to the repo’s .flowboard.yaml`)
            : nothing('Check command')}
          {pr.networkHosts?.length
            ? row(
                'networkHosts',
                'Network access',
                <span className="grid gap-0.5 font-mono text-xs">
                  {pr.networkHosts.map((h) => (
                    <span key={h.host} className={h.custom ? 'text-wait' : undefined}>
                      {h.custom && <TriangleAlert aria-label="custom host" className="mr-1 inline size-3" />}
                      {h.host}
                    </span>
                  ))}
                </span>,
                custom.length ? 'not a public package registry: check it before you accept' : 'the registries its lockfiles name; OpenSandbox boxes reach only these and the AI service',
              )
            : nothing('Network access')}
        </div>
        {mode === 'project' && <div className="flex items-center gap-3">{again('Analyse again')}</div>}
      </div>
    );
  }
  return (
    <section className="grid gap-2" aria-label="analysis">
      <div className={head}>
        the analysis agent{a?.status === 'done' ? ` proposes · ${usd(a.spentUsd)}` : ''}
      </div>
      {body}
      {errors}
    </section>
  );
}
