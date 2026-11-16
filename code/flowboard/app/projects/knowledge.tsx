'use client';
/**
 * One project's knowledge assets on its page: where its maps stand (`knowledgeView`) and **Rebuild**. A build is a
 * run of the project, so its link goes to the runs page.
 */
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsQuery, startKnowledgeBuild } from './api.ts';
import { knowledgeText } from './settings-model.ts';
import { Warn } from './settings-pages.tsx';

const small = 'text-[11px] text-muted-foreground';
const head = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';
const short = (c: string | null | undefined) => (c ? c.slice(0, 7) : 'no commit');
/** `2026-11-15T10-00-00-knowledge-build` -> `2026-11-15 10:00`. */
const when = (run: string) => run.slice(0, 16).replace('T', ' ').replace(/-(\d\d)$/, ':$1');

export function Knowledge({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  // Polled fast while a build runs, so the card says built as soon as it is.
  const projects = useQuery({ ...projectsQuery, refetchInterval: (q) => (q.state.data?.find((x) => x.id === projectId)?.knowledge.status === 'building' ? 2000 : 10_000) });
  const build = useMutation({ mutationFn: () => startKnowledgeBuild(projectId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }) });
  const p = projects.data?.find((x) => x.id === projectId);
  if (!p) return null;
  const k = p.knowledge;
  const run = k.run && (
    <Link href={`/runs?run=${encodeURIComponent(k.run)}`} className={`${small} underline underline-offset-[3px]`}>
      its run
    </Link>
  );
  const button = (
    <Button size="sm" variant="outline" disabled={build.isPending || k.status === 'building'} onClick={() => build.mutate()}>
      <RefreshCw aria-hidden className="size-3.5" />
      {build.isPending ? 'Starting…' : k.status === 'never' ? 'Build' : 'Rebuild'}
    </Button>
  );
  let line;
  if (k.status === 'off') line = <span className={small}>off; turn Serena or graphify on in the project settings</span>;
  else if (k.status === 'never') line = <span className={small}>never built; builds in the project’s sandbox, free</span>;
  else if (k.status === 'building') line = <span className="text-xs">building…</span>;
  else if (k.status === 'failed') line = <Warn>build failed: {k.error}</Warn>;
  else
    line = (
      <span className="text-xs">
        built at <code className="font-mono">{short(k.commit)}</code> · {when(k.run!)}
        {k.status === 'stale' && (
          <span className="text-wait">
            {' '}
            · stale: {p.baseBranch} is at <code className="font-mono">{short(k.tip)}</code> now
          </span>
        )}
      </span>
    );
  return (
    <section className="grid gap-2" aria-label="knowledge assets">
      <div className={head}>knowledge assets · {knowledgeText(p.settings.knowledge.value)}</div>
      {line}
      {k.status !== 'off' && (
        <div className="flex items-center gap-3">
          {button}
          {run}
        </div>
      )}
      {build.error && (
        <pre role="alert" className="m-0 border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
          {build.error.message}
        </pre>
      )}
    </section>
  );
}
