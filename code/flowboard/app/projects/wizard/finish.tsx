'use client';
/** The wizard's last step: everything at a glance, where the clone goes, then the clone as it happens. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FOLDER, FOLDER_RE, type ProjectType } from '../../../packages/cli/src/settings.ts';
import { type AppView, cloneJobQuery, cloneLost, startClone, targetQuery } from '../api.ts';
import { type Ctx, type Draft, fromLabel, limitsText, type PageId, problems, SETTING_PAGES, summary, toLimits, toOverrides } from '../settings-model.ts';
import { Warn } from '../settings-pages.tsx';
import { Frame, type WizardState } from './wizard.tsx';

interface Props {
  st: WizardState;
  set: (patch: Partial<WizardState>) => void;
  draft: Draft;
  ctx: Ctx;
  type: ProjectType;
  slug: string;
  /** The folder the clone goes inside, as typed or set. */
  parent: string;
  app: AppView;
  connected: boolean;
  onGo: (step: number, sub?: number) => void;
  onStarted: (job: string) => void;
  onOpen: () => void;
  onAgain: () => void;
  primary: (label: ReactNode, ok?: boolean, onClick?: () => void) => ReactNode;
  backBtn: ReactNode;
}

const small = 'text-[11px] text-muted-foreground';
const link = 'text-[11px] text-muted-foreground underline underline-offset-[3px] hover:text-foreground';

export function Finish({ st, set, draft, ctx, type, slug, parent, app, connected, onGo, onStarted, onOpen, onAgain, primary, backBtn }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const repo = st.repo!;
  const full = `${repo.owner}/${repo.name}`;
  const destProblem = st.dest === 'custom' && !FOLDER_RE.test(st.custom.trim()) ? FOLDER : '';
  const target = useQuery({ ...targetQuery(parent, repo.name), enabled: !destProblem && !!parent && !st.job });
  const start = useMutation({
    mutationFn: () => startClone({ repo: full, type: type.id, parent, makeDefault: st.dest === 'custom' && st.makeDefault, overrides: toOverrides(draft), limits: toLimits(draft) }),
    onSuccess: (job) => onStarted(job.id),
  });
  const job = useQuery({ ...cloneJobQuery(st.job ?? ''), enabled: !!st.job });
  const phase = job.data?.phase;
  useEffect(() => {
    if (phase !== 'done') return;
    for (const key of [['projects'], ['github', 'repos'], ['settings']]) void queryClient.invalidateQueries({ queryKey: key });
  }, [phase, queryClient]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [job.data?.lines.length]);

  const s = summary(draft, ctx);
  const pr = problems(draft, ctx);
  const subAt = (id: PageId) => SETTING_PAGES.findIndex((x) => x.id === id);
  const src = (k: keyof typeof draft.ov) => (draft.ov[k] ? 'override' : fromLabel(ctx.base[k].from, type.name));
  const row = (k: string, v: ReactNode, edit?: number | PageId, from?: string, caution = false) => (
    <div key={k} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border px-3 py-[7px] text-xs last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
      <span className="text-muted-foreground">{k}</span>
      <b className={`font-medium [overflow-wrap:anywhere] ${caution ? 'text-wait' : ''}`}>
        {v}
        {from && <small className={`ml-1.5 ${small}`}>{from}</small>}
      </b>
      {edit === undefined ? (
        <span />
      ) : (
        <button type="button" className={link} onClick={() => (typeof edit === 'number' ? onGo(edit) : onGo(3, subAt(edit)))}>
          edit
        </button>
      )}
    </div>
  );

  // ── the clone, once started ──
  if (st.job) {
    const j = job.data;
    const lost = cloneLost(job.error);
    const done = j?.phase === 'done' ? j.project : undefined;
    const failed = lost ? 'FlowBoard restarted during the clone, so it stopped; the folder may hold a partial clone.' : j?.phase === 'failed' ? j.error : undefined;
    const body = (
      <>
        {done && (
          <div className="mb-2.5 grid gap-1.5 border border-input border-l-[3px] border-l-run px-3.5 py-3">
            <b className="font-sans text-[15px]">
              {done.name} is ready at /p/{done.slug}
            </b>
            <span>
              {done.repoPath} on <b>{done.baseBranch}</b> · {type.name}: {type.flows.join(', ')} · {s.trust}
            </span>
            <span>knowledge: {s.knowledge}</span>
            {limitsText(draft.v) && <span className="text-wait">.flowboard.yaml is new in the repo: commit it so the limits travel with the code</span>}
            <span className="text-muted-foreground">Next: set the check command on the project page; {type.flows[0]} runs it.</span>
          </div>
        )}
        {failed && <Warn>{failed}</Warn>}
        {!done && !failed && (
          <>
            <div className="relative mt-2 mb-0.5 h-1 overflow-hidden bg-[var(--pend,#eae7de)]" aria-hidden>
              <i className="absolute inset-y-0 left-0 bg-run transition-[width]" style={{ width: `${j?.pct ?? 0}%` }} />
            </div>
            <div className={`mb-1.5 ${small} tracking-[0.12em] uppercase`}>
              {j?.phase === 'setting up' ? 'setting up' : 'receiving objects'} · {j?.pct ?? 0}%
            </div>
          </>
        )}
        <div ref={log} aria-live="polite" className="mt-2 h-[200px] overflow-auto border border-border bg-secondary px-3 py-2.5 text-xs whitespace-pre-wrap text-[var(--ink-2)]">
          {(j?.lines ?? []).map((l, i) => (
            <div key={i} className={l.startsWith('$ ') ? 'text-muted-foreground' : l.startsWith('-- ') ? 'text-foreground' : ''}>
              {l}
            </div>
          ))}
        </div>
      </>
    );
    const foot = done ? (
      <>
        <Button size="sm" variant="outline" onClick={onAgain}>
          Create another
        </Button>
        <span className="flex-1" />
        {primary(`Open ${done.name}`, true, () => {
          onOpen();
          router.push(`/p/${done.slug}`);
        })}
      </>
    ) : failed ? (
      <>
        <Button size="sm" variant="outline" onClick={() => set({ job: undefined })}>
          Back to review
        </Button>
        <span className="flex-1" />
      </>
    ) : (
      <>
        <span className={small}>closing this dialog does not stop it</span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" disabled>
          Cloning…
        </Button>
      </>
    );
    return <Frame step={4} sub={0} head={<h2>{done ? `${done.name} is a project` : failed ? `${full} was not cloned` : `Cloning ${full}`}</h2>} body={body} foot={foot} />;
  }

  // ── review ──
  const folder = target.data?.folder;
  const numbered = folder && !folder.endsWith(`/${repo.name}`);
  const body = (
    <>
      <div className="mb-3.5 border border-border">
        {row('repository', `github.com/${full} · ${repo.sizeKb < 1024 ? `${repo.sizeKb} KB` : `${Math.round(repo.sizeKb / 1024)} MB`}`, 2)}
        {row('project', `${repo.name} · /p/${slug}`, undefined, 'from the repo')}
        {row('base branch', repo.defaultBranch, undefined, 'follows GitHub')}
        {row('flows', type.flows.join(', '), 0, `${type.name} type`)}
        {row('sandbox', s.trust, 'sandbox', src('trust'))}
        {row('network', 'the AI service; registries after analysis')}
        {row('budget', s.budget, 'budget', src('budget'))}
        {row('escalation', s.escalation, 'escalation', src('escalation'))}
        {row('memory', s.memory, 'memory', src('memory'))}
        {row('knowledge', s.knowledge, 'knowledge', src('knowledge'), pr.warns.some((w) => w.caution && w.page === 'knowledge'))}
        {row('draft mode', s.draft, 'draft', src('draft'))}
        {row('check command', 'set on the project page after cloning')}
      </div>
      <div className={`mb-1.5 ${small} tracking-[0.12em] uppercase`}>clone into</div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        {(['default', 'custom'] as const).map((d) => (
          <label key={d} className="grid cursor-pointer grid-cols-[18px_1fr] items-start gap-x-2 gap-y-0.5 border border-border px-3 py-2.5 has-checked:border-run has-checked:bg-[var(--run-soft)]">
            <input type="radio" name="dest" className="mt-[3px] accent-[var(--run)]" checked={st.dest === d} onChange={() => set({ dest: d })} />
            {d === 'default' ? (
              <>
                <b>{app.app.projectsFolder ? 'Your projects folder' : 'FlowBoard’s projects folder'}</b>
                <small className="col-start-2 font-sans text-xs [overflow-wrap:anywhere] text-[var(--ink-2)]">
                  {(app.app.projectsFolder ?? app.defaultFolder).replace(/\/+$/, '')}/{repo.name}
                </small>
                <small className={`col-start-2 ${small}`}>{app.app.projectsFolder ? 'set in app settings → Projects folder' : 'the default until you pick your own, in app settings or below'}</small>
              </>
            ) : (
              <>
                <b>Somewhere else</b>
                <small className="col-start-2 font-sans text-xs text-[var(--ink-2)]">a folder for this project only; {repo.name} is made inside it</small>
              </>
            )}
          </label>
        ))}
      </div>
      {st.dest === 'custom' && (
        <div className="mb-2.5 grid gap-[7px] border border-border bg-secondary px-3 py-2.5">
          <Input
            autoFocus
            value={st.custom}
            onChange={(e) => set({ custom: e.target.value })}
            spellCheck={false}
            aria-label="Folder to clone into"
            placeholder="~/code"
            aria-invalid={destProblem ? true : undefined}
            className="font-mono"
          />
          {app.recentFolders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`${small} tracking-[0.12em] uppercase`}>used before</span>
              {app.recentFolders.map((d) => (
                <button key={d} type="button" aria-pressed={parent === d} onClick={() => set({ custom: d })} className="border border-input bg-card px-2 py-px text-xs hover:border-muted-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                  {d}
                </button>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ink-2)]">
            <input type="checkbox" className="accent-[var(--run)]" checked={st.makeDefault} disabled={!!destProblem} onChange={(e) => set({ makeDefault: e.target.checked })} />
            make it my projects folder for new projects too
          </label>
        </div>
      )}
      {destProblem ? (
        <Warn>{destProblem}</Warn>
      ) : (
        <>
          {numbered && (
            <div className="mb-2">
              <Warn>
                {parent}/{repo.name} already exists and holds something, so this clone goes to {folder.split('/').at(-1)}.
              </Warn>
            </div>
          )}
          <p className={`m-0 ${small}`}>→ {folder ?? '…'}</p>
        </>
      )}
      {start.error && (
        <div className="mt-2">
          <Warn>{start.error.message}</Warn>
        </div>
      )}
    </>
  );
  const foot = (
    <>
      {backBtn}
      {!connected && (
        <>
          <span className="text-[11px] text-wait">GitHub needs reconnecting before the clone</span>
          <button type="button" className={link} onClick={() => onGo(2)}>
            reconnect
          </button>
        </>
      )}
      <span className="flex-1" />
      {primary('Clone and create project', !destProblem && pr.ok && connected && !start.isPending, () => start.mutate())}
    </>
  );
  return <Frame step={4} sub={0} head={<h2>Review and clone</h2>} body={body} foot={foot} />;
}
