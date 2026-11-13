'use client';
/** One project: its settings, its runs, and the way to start one in its repo or to forget it. */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { libraryQuery } from '../flows/api.ts';
import { LIVE, runsQuery } from '../runs/api.ts';
import type { RunStatus } from '../runs/api.ts';
import { PROJECT_TYPES, resolveSettings, ruleText } from '../../packages/cli/src/settings.ts';
import { appSettingsQuery, inProject, newRunHref, projectsQuery, removeProject, updateProject, usd } from './api.ts';
import type { ProjectView } from './api.ts';
import { FlowSelect } from './flow-select.tsx';
import { Figures } from './list.tsx';
import { type Draft, draftFrom, type PageId, problems, toLimits, toOverrides } from './settings-model.ts';
import { lbl, SettingsPanel } from './settings-pages.tsx';
import { Topbar } from './topbar.tsx';

const DOT: Record<RunStatus, string> = { starting: 'bg-run', running: 'bg-run', waiting: 'bg-wait', paused: 'bg-wait', done: 'bg-[var(--done)]', failed: 'bg-fail' };
/** `2026-11-12T13-32-04-delivery` -> `2026-11-12 13:32:04`. */
const when = (run: string) => run.slice(0, 19).replace('T', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2');

function Settings({ p }: { p: ProjectView }) {
  const queryClient = useQueryClient();
  const library = useQuery(libraryQuery);
  const save = useMutation({
    mutationFn: (edit: Parameters<typeof updateProject>[1]) => updateProject(p.id, edit),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const initial = { name: p.name, defaultFlow: p.defaultFlow ?? '', checkCommand: p.checkCommand ?? '', baseBranch: p.baseBranch ?? '' };
  const form = useForm({
    defaultValues: initial,
    // Only what changed is sent: the check command is a file in the repo, written only when it is edited.
    onSubmit: ({ value }) =>
      save.mutate({
        ...(value.name !== initial.name && { name: value.name }),
        ...(value.defaultFlow !== initial.defaultFlow && { defaultFlow: value.defaultFlow || null }),
        ...(value.checkCommand.trim() !== initial.checkCommand && { checkCommand: value.checkCommand.trim() || null }),
        ...(value.baseBranch.trim() !== initial.baseBranch && { baseBranch: value.baseBranch.trim() || null }),
      }),
  });
  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[96px_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name" validators={{ onChange: ({ value }) => (value.trim() ? undefined : 'name the project') }}>
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="ps-name">Name</Label>
                <Input id="ps-name" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} aria-invalid={f.state.meta.errors.length > 0 || undefined} />
                {f.state.meta.errors.length > 0 && <em className="text-xs text-fail not-italic">{String(f.state.meta.errors[0])}</em>}
              </div>
            )}
          </form.Field>
          <form.Field name="defaultFlow">
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="ps-flow">Default flow</Label>
                <FlowSelect id="ps-flow" value={f.state.value} onChange={f.handleChange} flows={library.data?.flows} />
              </div>
            )}
          </form.Field>
          <form.Field name="checkCommand">
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="ps-check">Check command</Label>
                <Input id="ps-check" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="none set" spellCheck={false} className="font-mono" />
                <em className="text-xs text-muted-foreground not-italic">
                  what a shell step with an empty <code>shell:</code> runs. Kept in <code>.flowboard.yaml</code> in the repo; commit it with the code.
                </em>
              </div>
            )}
          </form.Field>
          <form.Field name="baseBranch">
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="ps-branch">Base branch</Label>
                <Input id="ps-branch" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="none: HEAD was detached" spellCheck={false} className="font-mono" />
                <em className="text-xs text-muted-foreground not-italic">the branch work starts from; the page warns when the repo has another checked out</em>
              </div>
            )}
          </form.Field>
          {p.problems.map((line) => (
            <p key={line} className="border-l-2 border-wait bg-[var(--wait-soft)] px-2 py-1 text-xs break-all text-wait">
              {line}
            </p>
          ))}
          {save.error && (
            <pre role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
              {save.error.message}
            </pre>
          )}
          {/* Once saved, the refetched project remounts the form on the new values: that is the confirmation. */}
          <form.Subscribe selector={(s) => [s.isDirty, s.canSubmit] as const}>
            {([dirty, ok]) => (
              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={!dirty || !ok || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
                {dirty && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => form.reset()}>
                    Discard
                  </Button>
                )}
              </div>
            )}
          </form.Subscribe>
          <div className="grid gap-1 border-t border-border pt-3">
            {row('slug', p.slug)}
            {row('repo', p.repoPath)}
            {row('registered', new Date(p.createdAt).toLocaleString())}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** The same settings pages as the wizard: what this project overrides over its type and the app. */
function ProjectSettings({ p }: { p: ProjectView }) {
  const queryClient = useQueryClient();
  const app = useQuery(appSettingsQuery);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(p.settings, p.limits));
  const [page, setPage] = useState<PageId>('overview');
  const save = useMutation({
    mutationFn: () => {
      const limits = toLimits(draft);
      // The limits are a file in the repo: written only when they changed.
      return updateProject(p.id, { overrides: toOverrides(draft), ...(JSON.stringify(limits) !== JSON.stringify(p.limits) && { limits }) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  if (!app.data) return null;
  const type = PROJECT_TYPES[p.type];
  const ctx = { base: resolveSettings(app.data.app, p.type, {}), os: app.data.machine.os, typeName: type.name, flows: type.flows, repo: { name: p.name, branch: p.baseBranch } };
  const dirty = JSON.stringify(toOverrides(draft)) !== JSON.stringify(p.overrides) || JSON.stringify(toLimits(draft)) !== JSON.stringify(p.limits);
  const ok = problems(draft, ctx).ok;
  return (
    <Card>
      <CardHeader>
        <CardTitle className={lbl}>project settings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SettingsPanel draft={draft} onChange={setDraft} ctx={ctx} mode="project" page={page} onPage={setPage} />
        {save.error && (
          <pre role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
            {save.error.message}
          </pre>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!dirty || !ok || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(draftFrom(p.settings, p.limits))}>
              Discard
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{!ok ? 'fix the fields marked in red' : 'trust, money and this machine stay with FlowBoard; limits go into the repo’s .flowboard.yaml'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** What "Allow from now on" saved on a Trusted project; removing a rule means the agent asks again. */
function Approvals({ p }: { p: ProjectView }) {
  const queryClient = useQueryClient();
  const rules = p.approvals ?? [];
  const drop = useMutation({
    mutationFn: (i: number) => updateProject(p.id, { approvals: rules.filter((_, j) => j !== i) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className={lbl}>allowed from now on</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="border border-border bg-card">
          {rules.map((r, i) => (
            <li key={ruleText(r)} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <span>{ruleText(r)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${ruleText(r)}`} disabled={drop.isPending} onClick={() => drop.mutate(i)}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {drop.error && (
          <p role="alert" className="text-xs text-fail">
            {drop.error.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Agents in this project run these without asking.</p>
      </CardContent>
    </Card>
  );
}

function Remove({ p, live }: { p: ProjectView; live: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeProject(p.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push('/');
    },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="hover:border-fail hover:bg-[var(--fail-soft)] hover:text-fail" disabled={live > 0} title={live ? 'A run of it is still going' : undefined}>
          <Trash2 aria-hidden /> Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-sans">Remove {p.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            FlowBoard forgets the project. The repo at <code className="break-all">{p.repoPath}</code>, its <code>.flowboard.yaml</code> and its runs stay where they are; adding the repo again brings the runs back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.error && (
          <p role="alert" className="text-xs text-fail">
            {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault(); // stay open until the server says yes, so a refusal can be read
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            Remove project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useQuery(projectsQuery);
  const runs = useQuery(runsQuery);
  const p = projects.data?.find((x) => x.slug === slug);
  const mine = p ? (runs.data ?? []).filter((r) => inProject(p.repoPath, r.folder)) : [];
  const live = mine.filter((r) => LIVE.has(r.status)).length;

  return (
    <div className="flex min-h-dvh flex-col text-[13px]">
      <Topbar slug={slug}>
        {p && (
          <>
            <Remove p={p} live={live} />
            <Button size="sm" asChild>
              <Link href={newRunHref(p)}>
                <Play aria-hidden /> New run
              </Link>
            </Button>
          </>
        )}
      </Topbar>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
        {projects.isPending && <p className="text-muted-foreground">Loading…</p>}
        {projects.isError && (
          <p role="alert" className="text-fail">
            {projects.error.message}
          </p>
        )}
        {projects.data && !p && (
          <p>
            No project has the slug <code>{slug}</code>.{' '}
            <Link href="/" className="text-run underline underline-offset-4">
              Back to projects
            </Link>
          </p>
        )}
        {p && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="font-sans text-lg font-semibold">{p.name}</h1>
              <span className="text-muted-foreground">
                {PROJECT_TYPES[p.type].name}
                {p.source.kind === 'github' && <> · github.com/{p.source.repo}</>}
                <span className="px-[0.45em] text-input">·</span>
                {p.defaultFlow ? `starts on ${p.defaultFlow}` : 'no default flow'}
                <span className="px-[0.45em] text-input">·</span>
                {usd(p.weekSpendUsd)} in the last 7 days
              </span>
            </div>
            <div className="grid items-start gap-5 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <Settings key={`${p.name}\n${p.defaultFlow}\n${p.checkCommand}\n${p.baseBranch}`} p={p} />
              <section className="flex min-w-0 flex-col gap-3" aria-labelledby="runs-h">
                <Figures runs={p.runs} />
                <div className="flex items-baseline gap-2">
                  <h2 id="runs-h" className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    runs in this repo
                  </h2>
                  <span className="text-xs text-muted-foreground">{mine.length}</span>
                </div>
                {runs.isError && <p className="text-fail">{runs.error.message}</p>}
                {runs.data && mine.length === 0 && (
                  <p className="border border-dashed border-input px-4 py-6 text-muted-foreground">
                    No runs in this repo yet. Start one with <b className="font-medium text-foreground">New run</b>.
                  </p>
                )}
                {mine.length > 0 && (
                  <ul className="border border-border bg-card">
                    {mine.map((r) => (
                      <li key={r.name} className="border-b border-border last:border-b-0">
                        <Link href={`/runs?run=${encodeURIComponent(r.name)}`} className="grid grid-cols-[8px_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 hover:bg-secondary">
                          <i className={`size-[7px] ${DOT[r.status]}`} aria-hidden />
                          <span className="truncate">
                            <b className="font-semibold">{r.flow || '?'}</b>
                            <span className="text-muted-foreground"> · {when(r.name)}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{r.status}</span>
                          <span className="w-16 text-right tabular-nums">{usd(r.spentUsd)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            {!!p.approvals?.length && <Approvals p={p} />}
            <ProjectSettings key={JSON.stringify([p.overrides, p.limits])} p={p} />
          </>
        )}
      </main>
    </div>
  );
}
