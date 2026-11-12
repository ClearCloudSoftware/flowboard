'use client';
/** The app's own settings: where projects are cloned, the GitHub connection, and the defaults every project inherits. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FOLDER, FOLDER_RE, resolveSettings } from '../../packages/cli/src/settings.ts';
import { type AppView, appSettingsQuery, switchAccount, updateAppSettings } from '../projects/api.ts';
import { type Draft, draftFrom, type PageId, problems, toSettings } from '../projects/settings-model.ts';
import { lbl, SettingsPanel } from '../projects/settings-pages.tsx';
import { Topbar } from '../projects/topbar.tsx';
import { GhFix } from './github.tsx';

const ErrorLine = ({ error }: { error: Error | null }) =>
  error && (
    <pre role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
      {error.message}
    </pre>
  );

function ProjectsFolder({ view }: { view: AppView }) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(view.app.projectsFolder ?? '');
  const save = useMutation({ mutationFn: () => updateAppSettings({ projectsFolder: folder.trim() || null }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }) });
  const bad = folder.trim() !== '' && !FOLDER_RE.test(folder.trim());
  const dirty = (folder.trim() || null) !== view.app.projectsFolder;
  return (
    <Card>
      <CardHeader>
        <CardTitle className={lbl}>projects folder</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="m-0 font-sans text-xs text-[var(--ink-2)]">Where the new project wizard clones repositories, unless you pick another folder for one. Left empty, FlowBoard&apos;s own: {view.defaultFolder}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Projects folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={view.defaultFolder} spellCheck={false} aria-invalid={bad || undefined} className="max-w-md font-mono" />
          <Button size="sm" disabled={!dirty || bad || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {bad && <em className="text-[11px] text-fail not-italic">{FOLDER}</em>}
        <ErrorLine error={save.error} />
      </CardContent>
    </Card>
  );
}

function GitHub({ view }: { view: AppView }) {
  const queryClient = useQueryClient();
  const recheck = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['settings'] }), queryClient.invalidateQueries({ queryKey: ['github'] })]);
  const sw = useMutation({ mutationFn: switchAccount, onSuccess: recheck });
  const gh = view.github;
  return (
    <Card>
      <CardHeader>
        <CardTitle className={lbl}>connections · github</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 font-sans text-[13px]">
        {gh.state === 'connected' ? (
          <>
            <p className="m-0">
              Connected as <b>{gh.login}</b> through the GitHub CLI&apos;s login. Every project clones, fetches and pushes with it; FlowBoard keeps no token of its own, and agents never see one.
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle className={lbl}>defaults</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SettingsPanel draft={draft} onChange={setDraft} ctx={ctx} mode="app" page={page} onPage={setPage} />
        <ErrorLine error={save.error} />
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!dirty || !ok || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save defaults'}
          </Button>
          <span className="text-xs text-muted-foreground">{ok ? 'a project type, then each project, can set its own over these' : 'fix the fields marked in red'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AppSettingsPage() {
  const view = useQuery(appSettingsQuery);
  return (
    <div className="flex min-h-dvh flex-col text-[13px]">
      <Topbar here="settings" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
        <h1 className="m-0 font-sans text-lg font-semibold">Settings</h1>
        {view.isPending && <p className="text-muted-foreground">Loading…</p>}
        {view.isError && (
          <p role="alert" className="text-fail">
            {view.error.message}
          </p>
        )}
        {view.data && (
          <>
            <ProjectsFolder key={view.data.app.projectsFolder ?? ''} view={view.data} />
            <GitHub view={view.data} />
            <Defaults key={JSON.stringify(view.data.app)} view={view.data} />
          </>
        )}
      </main>
    </div>
  );
}
