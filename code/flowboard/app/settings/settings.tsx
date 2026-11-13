'use client';
/** The app settings sections: General, the three Connections pages and Defaults; Agents is `agents.tsx`. Each loads /api/settings. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CircleDot, FileText, FolderGit2, GitBranch, ListTodo, type LucideIcon, Mail, MessageSquare, Webhook } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FOLDER, FOLDER_RE, resolveSettings } from '../../packages/cli/src/settings.ts';
import { type AppView, appSettingsQuery, switchAccount, updateAppSettings } from '../projects/api.ts';
import { type Draft, draftFrom, type PageId, problems, toSettings } from '../projects/settings-model.ts';
import { SettingsPanel } from '../projects/settings-pages.tsx';
import { SOURCES } from '../projects/wizard/wizard.tsx';
import { GhFix } from './github.tsx';

export const ErrorLine = ({ error }: { error: Error | null }) =>
  error && (
    <pre role="alert" className="m-0 border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
      {error.message}
    </pre>
  );

/** A section's title over a hairline, as GitHub's settings pages open. */
export function Head({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="grid gap-1 border-b border-border pb-2">
      <h2 className="m-0 font-sans text-xl font-normal">{title}</h2>
      {children && <p className="m-0 font-sans text-xs text-[var(--ink-2)]">{children}</p>}
    </header>
  );
}

/** One setting in a section: a bold name, what it does, then its controls. */
export function Field({ title, htmlFor, text, children }: { title: string; htmlFor?: string; text: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <label htmlFor={htmlFor} className="font-sans text-sm font-semibold">
        {title}
      </label>
      <p className="m-0 -mt-1 font-sans text-xs text-[var(--ink-2)]">{text}</p>
      {children}
    </section>
  );
}

/** `children` once /api/settings has answered. */
function WithView({ children }: { children: (view: AppView) => ReactNode }) {
  const view = useQuery(appSettingsQuery);
  if (view.isPending) return <p className="m-0 text-muted-foreground">Loading…</p>;
  if (view.isError)
    return (
      <p role="alert" className="m-0 text-fail">
        {view.error.message}
      </p>
    );
  return <>{children(view.data)}</>;
}

function ProjectsFolder({ view }: { view: AppView }) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(view.app.projectsFolder ?? '');
  const save = useMutation({ mutationFn: () => updateAppSettings({ projectsFolder: folder.trim() || null }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }) });
  const bad = folder.trim() !== '' && !FOLDER_RE.test(folder.trim());
  const dirty = (folder.trim() || null) !== view.app.projectsFolder;
  return (
    <Field title="Projects folder" htmlFor="projects-folder" text={<>Where the new project wizard clones repositories, unless you pick another folder for one. Left empty, FlowBoard&apos;s own: {view.defaultFolder}.</>}>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="projects-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={view.defaultFolder} spellCheck={false} aria-invalid={bad || undefined} className="max-w-md font-mono" />
        <Button size="sm" disabled={!dirty || bad || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {bad && <em className="text-[11px] text-fail not-italic">{FOLDER}</em>}
      <ErrorLine error={save.error} />
    </Field>
  );
}

export function GeneralPage() {
  return (
    <>
      <Head title="General" />
      <WithView>{(view) => <ProjectsFolder key={view.app.projectsFolder ?? ''} view={view} />}</WithView>
    </>
  );
}

/** A connection's row: its icon, name, what it is for, and what it says now. */
function Row({ icon, name, text, soon, children }: { icon: ReactNode; name: string; text: string; soon?: boolean; children?: ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <span className="pt-0.5 text-muted-foreground">{icon}</span>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-sans text-sm font-semibold">{name}</b>
          {soon && <span className="border border-border px-1.5 text-[11px] text-muted-foreground">coming soon</span>}
        </div>
        <p className="m-0 font-sans text-xs text-[var(--ink-2)]">{text}</p>
        {children}
      </div>
    </li>
  );
}

function GitHub({ view }: { view: AppView }) {
  const queryClient = useQueryClient();
  const recheck = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['settings'] }), queryClient.invalidateQueries({ queryKey: ['github'] })]);
  const sw = useMutation({ mutationFn: switchAccount, onSuccess: recheck });
  const gh = view.github;
  return (
    <Row icon={icon(FolderGit2)} name="GitHub" text="Repositories to clone, fetch and push, through the GitHub CLI's login. FlowBoard keeps no token of its own, and agents never see one.">
      <div className="grid gap-2 font-sans text-[13px]">
        {gh.state === 'connected' ? (
          <>
            <p className="m-0">
              <span className="mr-1.5 inline-block size-[7px] bg-run align-middle" aria-hidden />
              Connected as <b>{gh.login}</b>
            </p>
            {gh.accounts.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">switch to</span>
                {gh.accounts
                  .filter((a) => a !== gh.login)
                  .map((a) => (
                    <Button key={a} size="sm" variant="outline" disabled={sw.isPending} onClick={() => sw.mutate(a)}>
                      {a}
                    </Button>
                  ))}
              </div>
            )}
            <p className="m-0 text-xs text-muted-foreground">
              Another account: run <code className="bg-secondary px-1 py-px">gh auth login</code> in a terminal; it is listed here once the CLI holds it.
            </p>
          </>
        ) : (
          <p className="m-0 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 text-wait">
            <GhFix status={gh} />
          </p>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={() => void recheck()}>
            Check again
          </Button>
        </div>
        <ErrorLine error={sw.error} />
      </div>
    </Row>
  );
}

const ul = 'm-0 list-none border border-border bg-card p-0';
const icon = (I: LucideIcon) => <I className="size-5" strokeWidth={1.75} />;

/** Connections not built yet, as rows. */
const Soon = ({ items }: { items: { id: string; name: string; text: string; icon: LucideIcon }[] }) =>
  items.map((s) => <Row key={s.id} icon={icon(s.icon)} name={s.name} text={s.text} soon />);

export function RepositoriesPage() {
  const view = useQuery(appSettingsQuery);
  const hosts = SOURCES.filter((s) => s.soon && s.id !== 'local').map((s) => ({ ...s, icon: GitBranch }));
  return (
    <>
      <Head title="Source repositories">Where projects are cloned from, and pushed back to, through a login this machine already has.</Head>
      <ul className={ul}>
        {view.data ? (
          <GitHub view={view.data} />
        ) : (
          <Row icon={icon(FolderGit2)} name="GitHub" text={view.isError ? view.error.message : 'Checking the GitHub CLI…'} />
        )}
        <Soon items={hosts} />
      </ul>
    </>
  );
}

// Intake And Import's TaskSource adapters: markdown first, the rest later (Future Task Sources).
const TASK_PROVIDERS = [
  { id: 'markdown', name: 'Markdown backlog', text: 'A backlog file in a repo, imported as tasks; importing again updates them rather than adding copies.', icon: FileText },
  { id: 'github', name: 'GitHub Issues', text: "A repository's issues as tasks, through the same GitHub CLI login as the repositories.", icon: CircleDot },
  { id: 'linear', name: 'Linear', text: "A team's issues as tasks.", icon: ListTodo },
  { id: 'jira', name: 'Jira', text: "A project's issues as tasks.", icon: ListTodo },
  { id: 'webhook', name: 'Webhook', text: 'Any tool that can post JSON to FlowBoard creates a task.', icon: Webhook },
];

export function TaskProvidersPage() {
  return (
    <>
      <Head title="Task providers">Where tasks come from, besides creating them by hand.</Head>
      <ul className={ul}>
        <Soon items={TASK_PROVIDERS} />
      </ul>
    </>
  );
}

// Escalation And Notifications' Notifier adapters: Slack first (it answers in place), the rest later (Notification Channels).
const CHANNELS = [
  { id: 'slack', name: 'Slack', text: "A question nobody answered in FlowBoard is posted to the channel a project's escalation names, and can be answered there.", icon: MessageSquare },
  { id: 'discord', name: 'Discord', text: 'The same, in a Discord channel, answered in place.', icon: MessageSquare },
  { id: 'email', name: 'Email', text: 'A link to the question in the inbox; the answer is given in FlowBoard.', icon: Mail },
  { id: 'webhook', name: 'Webhook', text: 'The question posted as JSON to a URL, with a link back to the inbox.', icon: Webhook },
  { id: 'desktop', name: 'Desktop', text: 'A notification on this machine.', icon: Bell },
];

export function EscalationChannelsPage() {
  return (
    <>
      <Head title="Escalation channels">Where a question that waited too long reaches you. Each project picks its channel and how long to wait, under Defaults or its own settings.</Head>
      <ul className={ul}>
        <Soon items={CHANNELS} />
      </ul>
    </>
  );
}

function Defaults({ view }: { view: AppView }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(resolveSettings(view.app, 'research', {}), {}));
  const [page, setPage] = useState<PageId>('overview');
  const save = useMutation({ mutationFn: () => updateAppSettings(toSettings(draft)), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }) });
  // 'research' sets nothing over the app's, so this resolves to the app's own values.
  const ctx = { base: resolveSettings(view.app, 'research', {}), os: view.machine.os, typeName: 'project', flows: [] };
  const dirty = JSON.stringify(toSettings(draft)) !== JSON.stringify(toSettings(draftFrom(ctx.base, {})));
  const ok = problems(draft, ctx, 'app').ok;
  return (
    <div className="grid gap-4">
      <SettingsPanel draft={draft} onChange={setDraft} ctx={ctx} mode="app" page={page} onPage={setPage} />
      <ErrorLine error={save.error} />
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button size="sm" disabled={!dirty || !ok || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save defaults'}
        </Button>
        <span className="text-xs text-muted-foreground">{ok ? 'a project type, then each project, can set its own over these' : 'fix the fields marked in red'}</span>
      </div>
    </div>
  );
}

export function DefaultsPage() {
  return (
    <>
      <Head title="Defaults" />
      <WithView>{(view) => <Defaults key={JSON.stringify(view.app)} view={view} />}</WithView>
    </>
  );
}
