'use client';
/**
 * The new project wizard (`docs/mockups/new-project-wizard.html`): the type, where the code lives, the repository,
 * a page per setting, then review and clone. Nothing is cloned until the last step; closing the dialog while it
 * clones does not stop it, and opening it again shows that clone.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, CircleAlert, Code, Database, Folder, GitBranch, PenLine } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PROJECT_TYPES, type ProjectTypeId, resolveSettings } from '../../../packages/cli/src/settings.ts';
import { projectSlug } from '../../../packages/cli/src/slug.ts';
import { appSettingsQuery, type GhRepo, githubQuery, projectsQuery } from '../api.ts';
import { type Ctx, type Draft, draftFrom, note, problems, SETTING_PAGES } from '../settings-model.ts';
import { MARK, pageState, SettingPage } from '../settings-pages.tsx';
import { Finish } from './finish.tsx';
import { ConnectBox, RepoStep } from './repo-step.tsx';

const ICON = { software: Code, research: BookOpen, writing: PenLine, data: Database };
export const SOURCES = [
  { id: 'github', name: 'GitHub', text: 'github.com, personal accounts and organizations' },
  { id: 'gitlab', name: 'GitLab', text: 'gitlab.com and self-managed', soon: true },
  { id: 'bitbucket', name: 'Bitbucket', text: 'Bitbucket Cloud', soon: true },
  { id: 'azure', name: 'Azure Repos', text: 'Azure DevOps', soon: true },
  { id: 'local', name: 'A folder on this machine', text: 'a git repository you already cloned', soon: true },
];
const STEPS = ['Type', 'Source', 'Repository', 'Settings', 'Clone'];

/** `sub`: the settings page shown; `job`: the clone, once started. */
export interface WizardState {
  step: number;
  reached: number;
  type?: ProjectTypeId;
  source?: 'github';
  owner?: string;
  repo?: GhRepo;
  sub: number;
  draft?: Draft;
  dest: 'default' | 'custom';
  custom: string;
  makeDefault: boolean;
  job?: string;
}
const FRESH: WizardState = { step: 0, reached: 0, sub: 0, dest: 'default', custom: '', makeDefault: false };
// ponytail: the wizard's state outlives the dialog in this module, so a clone in flight is there when it reopens; a reload forgets it
let kept: WizardState | undefined;

const lblCls = 'text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase';
const soonCls = 'border border-dashed border-input px-1.5 text-[10px] tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase';

export function Wizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [st, setSt] = useState<WizardState>(() => kept ?? FRESH);
  const set = (patch: Partial<WizardState>) => setSt((s) => ({ ...s, ...patch }));
  const latest = useRef(st);
  useEffect(() => {
    latest.current = st;
    kept = st.job ? st : undefined; // only a clone that was started is worth coming back to
  }, [st]);
  const gh = useQuery(githubQuery);
  const app = useQuery(appSettingsQuery);
  const projects = useQuery(projectsQuery);

  const connected = gh.data?.status.state === 'connected';
  const type = st.type ? PROJECT_TYPES[st.type] : undefined;
  const ctx: Ctx | undefined =
    app.data && type
      ? { base: resolveSettings(app.data.app, type.id, {}), os: app.data.machine.os, typeName: type.name, flows: type.flows, repo: st.repo && { name: st.repo.name, branch: st.repo.defaultBranch, sizeKb: st.repo.sizeKb } }
      : undefined;
  const draft = st.draft ?? (ctx ? draftFrom(ctx.base, {}) : undefined);
  const pr = draft && ctx ? problems(draft, ctx) : undefined;
  const slug = st.repo ? projectSlug(projects.data ?? [], st.repo.name, st.repo.owner) : '';
  const parent = st.dest === 'default' ? (app.data?.app.projectsFolder ?? app.data?.defaultFolder ?? '') : st.custom.trim().replace(/\/+$/, '');
  const canLeave = [!!st.type, !!st.source, !!st.repo && connected, !!pr?.ok, connected][st.step];
  const overrides = draft ? Object.values(draft.ov).filter(Boolean).length : 0;

  /** Into Settings: the page asked for, else the first going forward and the last coming back from Review. */
  const go = (step: number, sub?: number) =>
    setSt((s) => ({ ...s, step, reached: Math.max(s.reached, step), sub: step === 3 ? (sub ?? (s.step === 3 ? s.sub : s.step > 3 ? SETTING_PAGES.length - 1 : 0)) : s.sub }));
  const next = () => (st.step === 3 && st.sub < SETTING_PAGES.length - 1 ? set({ sub: st.sub + 1 }) : go(st.step + 1));
  const back = () => (st.step === 3 && st.sub > 0 ? set({ sub: st.sub - 1 }) : go(st.step - 1));
  const cloning = !!st.job;

  /** Enter continues, unless it is pressing a button or ticking a box. */
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || (e.target as HTMLElement).closest('button, a, input[type=checkbox], input[type=radio], textarea')) return;
    const primary = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-primary]:not(:disabled)');
    if (primary) {
      e.preventDefault();
      primary.click();
    }
  };

  const railSub = [type?.name, st.source && 'GitHub', st.repo && `${st.repo.owner}/${st.repo.name}`, st.repo && (overrides ? `${overrides} override${overrides === 1 ? '' : 's'}` : 'all inherited'), st.repo && parent];
  const primary = (label: ReactNode, ok = canLeave, onClick = next) => (
    <Button size="sm" data-primary disabled={!ok} onClick={onClick}>
      {label}
      <kbd className="ml-1.5 border border-current px-[3px] text-[10px] opacity-70">↵</kbd>
    </Button>
  );
  const backBtn = (
    <Button size="sm" variant="outline" disabled={st.step === 0} onClick={back}>
      Back
    </Button>
  );

  let head: ReactNode;
  let body: ReactNode;
  let foot: ReactNode;
  let finish: ReactNode;
  if (st.step === 0) {
    head = (
      <>
        <h2>What kind of project is it?</h2>
        <p>The type decides which flows the project runs and the defaults its settings start from.</p>
      </>
    );
    body = (
      <div className="grid gap-2.5 sm:grid-cols-2">
        {Object.values(PROJECT_TYPES).map((t) => {
          const Icon = ICON[t.id];
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={st.type === t.id}
              disabled={t.soon}
              onClick={() => set({ type: t.id })}
              className="grid grid-cols-[28px_1fr_auto] items-start gap-x-2.5 gap-y-1 border border-input p-3.5 text-left transition-colors enabled:hover:border-muted-foreground disabled:border-dashed disabled:text-muted-foreground aria-pressed:border-run aria-pressed:bg-[var(--run-soft)] aria-pressed:shadow-[inset_0_0_0_1px_var(--run)]"
            >
              <Icon className={`row-span-2 size-[22px] ${st.type === t.id ? 'text-run' : ''}`} strokeWidth={1.6} aria-hidden />
              <b className="font-sans text-sm font-semibold">{t.name}</b>
              {t.soon ? <span className={soonCls}>coming soon</span> : <span />}
              <p className="col-span-2 col-start-2 m-0 font-sans text-xs text-[var(--ink-2)]">{t.text}</p>
              {!t.soon && <span className="col-span-2 col-start-2 text-[11px] text-muted-foreground">flows: {t.flows.join(', ')} · sandboxed in a container</span>}
            </button>
          );
        })}
      </div>
    );
  } else if (st.step === 1) {
    head = (
      <>
        <h2>Where does the code live?</h2>
        <p>FlowBoard clones the repository onto this machine. Agents work on that clone; FlowBoard does every fetch and push itself.</p>
      </>
    );
    const ghLabel = gh.data && (connected ? <span className={`${lblCls} text-run`}>connected as {gh.data.status.state === 'connected' && gh.data.status.login}</span> : <span className={`${lblCls} text-wait`}>{gh.data.status.state === 'rejected' ? 'reconnect needed' : 'not connected'}</span>);
    body = (
      <div className="border border-border">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={st.source === s.id}
            disabled={s.soon}
            onClick={() => set({ source: 'github' })}
            className="grid w-full grid-cols-[28px_1fr_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-border px-3.5 py-[11px] text-left last:border-b-0 disabled:text-muted-foreground aria-pressed:bg-[var(--run-soft)] aria-pressed:shadow-[inset_3px_0_0_var(--run)]"
          >
            {s.id === 'local' ? <Folder className="row-span-2 size-[18px]" strokeWidth={1.6} aria-hidden /> : <GitBranch className="row-span-2 size-[18px]" strokeWidth={1.6} aria-hidden />}
            <b>{s.name}</b>
            {s.soon ? <span className={soonCls}>coming soon</span> : (ghLabel ?? <span />)}
            <small className="col-start-2 font-sans text-xs text-[var(--ink-2)]">{s.text}</small>
          </button>
        ))}
      </div>
    );
  } else if (st.step === 2) {
    const state = gh.data?.status.state;
    head = <h2>{connected ? 'Pick the repository' : state === 'rejected' ? 'Reconnect GitHub' : 'Connect your GitHub account'}</h2>;
    const owner = st.owner ?? (gh.data?.status.state === 'connected' ? gh.data.status.login : '');
    body = gh.isPending ? (
      <p className="text-muted-foreground">Asking the GitHub CLI who is logged in…</p>
    ) : gh.isError ? (
      <p className="text-fail">{gh.error.message}</p>
    ) : connected ? (
      <RepoStep
        gh={gh.data!}
        owner={owner}
        onOwner={(o) => set({ owner: o })}
        picked={st.repo}
        // a different repo is a different project, so its settings are looked at again
        onPick={(r) => setSt((s) => (s.repo?.owner === r.owner && s.repo.name === r.name ? s : { ...s, repo: r, reached: Math.min(s.reached, 3) }))}
      />
    ) : (
      <ConnectBox gh={gh.data!} onCheck={() => void gh.refetch()} checking={gh.isFetching} />
    );
    foot = (
      <>
        {backBtn}
        <span className="text-[11px] text-muted-foreground">{st.repo ? `${st.repo.owner}/${st.repo.name} · default branch ${st.repo.defaultBranch}` : 'no repository picked'}</span>
        <span className="flex-1" />
        {primary('Continue')}
      </>
    );
  } else if (st.step === 3 && draft && ctx && st.repo && type) {
    const page = SETTING_PAGES[st.sub];
    const last = st.sub === SETTING_PAGES.length - 1;
    const p = { draft, onChange: (d: Draft) => set({ draft: d }), ctx, mode: 'project' as const };
    const pageBad = pageState(p, page.id) === 'bad';
    head = (
      <>
        <h2>{page.title}</h2>
        <p>{page.intro}</p>
      </>
    );
    const fact = (k: string, v: ReactNode, pending = false) => (
      <span>
        {k} <b className={`font-medium ${pending ? 'text-wait' : 'text-foreground'}`}>{v}</b>
      </span>
    );
    body = (
      <SettingPage
        page={page.id}
        onPage={(id) => go(3, SETTING_PAGES.findIndex((x) => x.id === id))}
        facts={
          <div aria-label="Fixed by the repository" className="mb-3 flex flex-wrap gap-x-[18px] gap-y-1 border border-border bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
            {fact('name', st.repo.name)}
            {fact('address', `/p/${slug}`)}
            <span>
              base branch <b className="font-medium text-foreground">{st.repo.defaultBranch}</b>, follows GitHub
            </span>
            {fact('flows', type.flows.join(', '))}
            {fact('check command', 'set on the project page after cloning', true)}
          </div>
        }
        {...p}
      />
    );
    foot = (
      <>
        {backBtn}
        <span className="text-[11px] text-muted-foreground">
          {pageBad ? 'fix the fields marked in red' : last && !pr?.ok ? `fix ${SETTING_PAGES.filter((x) => pageState(p, x.id) === 'bad').map((x) => x.title).join(', ')} first` : 'every page can be changed later on the project page'}
        </span>
        <span className="flex-1" />
        {primary(last ? 'Review' : `Next: ${SETTING_PAGES[st.sub + 1].title}`, last ? !!pr?.ok : !pageBad)}
      </>
    );
  } else if (st.step === 4 && draft && ctx && st.repo && type && app.data) {
    finish = (
      <Finish
        st={st}
        set={set}
        draft={draft}
        ctx={ctx}
        type={type}
        slug={slug}
        parent={parent}
        app={app.data}
        connected={connected}
        onGo={go}
        // Kept here as well as in state: the dialog may have closed before the clone's start came back.
        onStarted={(job) => {
          kept = { ...latest.current, job };
          set({ job });
        }}
        onOpen={() => {
          // Closed first: Next keeps the list page alive, hidden, so a dialog still open there would cover the new page.
          kept = undefined;
          onClose();
        }}
        onAgain={() => {
          kept = undefined;
          setSt(FRESH);
          void queryClient.invalidateQueries({ queryKey: ['github', 'repos'] });
        }}
        primary={primary}
        backBtn={backBtn}
      />
    );
  }
  foot ??= (
    <>
      {backBtn}
      <span className="flex-1" />
      {primary('Continue')}
    </>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKey}
        className="top-[5vh] grid max-h-[90dvh] min-h-[580px] w-[min(900px,calc(100%-2rem))] translate-y-0 grid-rows-[auto_1fr] gap-0 overflow-auto rounded-none border border-input p-0 ring-0 sm:max-w-[900px] md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1"
      >
        <nav aria-label="Steps" className="flex overflow-auto border-b border-border bg-secondary py-2 md:flex-col md:border-r md:border-b-0 md:py-[18px]">
          <DialogTitle className="mx-[18px] mb-4 hidden font-sans text-[15px] font-semibold md:block">New project</DialogTitle>
          <DialogDescription className="sr-only">Pick a repository, set the project&apos;s settings, then clone it.</DialogDescription>
          {STEPS.map((name, i) => {
            const bad = (i === 3 && st.reached >= 3 && !!pr && !pr.ok) || (i === 2 && gh.data?.status.state === 'rejected');
            const on = i === st.step;
            const done = !on && !bad && i < st.reached;
            return (
              <div key={name} className="contents">
                <button
                  type="button"
                  disabled={i > st.reached || cloning}
                  aria-current={on ? 'step' : undefined}
                  onClick={() => go(i)}
                  className={`grid w-auto grid-cols-[22px_1fr] gap-x-2 gap-y-0.5 border-b-[3px] px-[18px] py-2 text-left whitespace-nowrap md:w-full md:border-b-0 md:border-l-[3px] ${on ? 'border-run bg-card text-foreground' : `border-transparent ${done ? 'text-[var(--ink-2)]' : 'text-muted-foreground'} enabled:hover:text-foreground`}`}
                >
                  <span
                    className={`row-span-2 flex size-5 items-center justify-center border text-[11px] ${on ? 'border-run bg-card text-run' : bad ? 'border-wait bg-wait text-white' : done ? 'border-[var(--done)] bg-[var(--done)] text-white' : 'border-input bg-card'}`}
                  >
                    {on ? i + 1 : bad ? <CircleAlert className="size-3.5" aria-hidden /> : done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span>{name}</span>
                  <small className="hidden truncate text-[11px] text-muted-foreground md:block">{i <= st.reached ? (railSub[i] ?? '') : ''}</small>
                </button>
                {i === 3 && st.reached >= 3 && draft && ctx && (
                  <div role="group" aria-label="Settings" className="flex md:grid md:pt-0.5 md:pb-1.5">
                    {SETTING_PAGES.map((x, j) => {
                      const here = st.step === 3 && st.sub === j;
                      return (
                        <button
                          key={x.id}
                          type="button"
                          disabled={cloning}
                          aria-current={here ? 'page' : undefined}
                          onClick={() => go(3, j)}
                          className={`grid w-auto grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-2 border-l-0 px-2.5 py-2 text-left text-xs whitespace-nowrap md:w-full md:border-l-[3px] md:py-1 md:pr-3.5 md:pl-11 ${here ? 'border-run bg-card font-medium text-foreground' : 'border-transparent text-muted-foreground enabled:hover:text-foreground'}`}
                        >
                          <i aria-hidden className={`size-[7px] border ${MARK[pageState({ draft, ctx, mode: 'project', onChange: () => {} }, x.id)]}`} />
                          <span className="truncate">{x.title}</span>
                          <small className="hidden max-w-[70px] truncate text-[10px] text-run md:block">{note(draft, x.key)}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p className="mt-auto hidden px-[18px] text-[11px] text-muted-foreground md:block">
            Click any step you have reached to change it. Nothing is cloned until the last step. <kbd>↵</kbd> continues, <kbd>Esc</kbd> closes.
          </p>
        </nav>
        {finish ?? <Frame step={st.step} sub={st.sub} head={head} body={body} foot={foot} />}
      </DialogContent>
    </Dialog>
  );
}

/** The right side of the dialog: the step's heading, its body, and its buttons. */
export function Frame({ step, sub, head, body, foot }: { step: number; sub: number; head: ReactNode; body: ReactNode; foot: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="px-[22px] pt-[18px] pb-1.5 [&_h2]:mt-0.5 [&_h2]:mb-1 [&_h2]:font-sans [&_h2]:text-[17px] [&_h2]:font-semibold [&_p]:m-0 [&_p]:max-w-[64ch] [&_p]:font-sans [&_p]:text-[var(--ink-2)]">
        <span className={lblCls}>
          step {step + 1} of 5{step === 3 && ` · settings · ${sub + 1} of ${SETTING_PAGES.length}`}
        </span>
        {head}
      </div>
      <div className="min-h-0 flex-1 px-[22px] pt-3 pb-[18px]">{body}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-border bg-card px-[22px] py-3">{foot}</div>
    </section>
  );
}
