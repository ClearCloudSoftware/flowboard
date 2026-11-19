'use client';
/**
 * The kanban board for one project.
 *
 * Reads tasks from `/api/projects/<id>/tasks` (TanStack Query, 10s poll), groups
 * them into three Jira `statusCategory` columns — Backlog (new), In progress
 * (indeterminate), Done (done) — plus a fallback "Unsorted" column for tasks
 * whose source didn't fill in a category. Everything else is defer: no
 * drag-and-drop, no create/edit, no filtering.
 *
 * Trust boundary carries forward: a card renders title, labels, body, etc.
 * from source data. We show it as content inside <b>, <p>, <span> — never
 * execute it as HTML, never pass it to a prompt, never auto-fetch any URL
 * the title mentions.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Users } from 'lucide-react';
import { Loader } from '@/components/loader';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Topbar } from './topbar.tsx';
import { projectsQuery, projectTasksQuery, type TaskRow } from './api.ts';

type Column = { id: 'backlog' | 'progress' | 'done' | 'unsorted'; label: string; match: (t: TaskRow) => boolean };

/** Order matters: the first match wins. "unsorted" is the catch-all for sources without a statusCategory. */
const COLUMNS: Column[] = [
  { id: 'backlog', label: 'Backlog', match: (t) => categoryOf(t) === 'new' },
  { id: 'progress', label: 'In progress', match: (t) => categoryOf(t) === 'indeterminate' },
  { id: 'done', label: 'Done', match: (t) => categoryOf(t) === 'done' },
  { id: 'unsorted', label: 'Unsorted', match: () => true },
];

function categoryOf(t: TaskRow): string | undefined {
  const raw = t.extras['statusCategory'];
  return typeof raw === 'string' ? raw : undefined;
}

function statusName(t: TaskRow): string | undefined {
  const raw = t.extras['statusName'];
  return typeof raw === 'string' ? raw : undefined;
}

function upstreamKey(t: TaskRow): string | undefined {
  const raw = t.extras['issueKey'];
  if (typeof raw === 'string') return raw;
  return t.hint.upstream;
}

function sourceBadge(sourceId: string): string {
  if (sourceId === 'jira') return 'Jira';
  if (sourceId === 'github') return 'GitHub';
  if (sourceId === 'markdown') return 'Markdown';
  return sourceId;
}

export function TasksBoard() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useQuery(projectsQuery);
  const p = projects.data?.find((x) => x.slug === slug);
  const tasks = useQuery({ ...projectTasksQuery(p?.id ?? ''), enabled: p !== undefined });
  const [open, setOpen] = useState<TaskRow | undefined>(undefined);

  const grouped = useMemo(() => {
    const rows = tasks.data?.tasks ?? [];
    const out = new Map<Column['id'], TaskRow[]>(COLUMNS.map((c) => [c.id, []]));
    for (const t of rows) {
      for (const c of COLUMNS) {
        if (c.match(t)) {
          out.get(c.id)!.push(t);
          break;
        }
      }
    }
    return out;
  }, [tasks.data]);

  return (
    <div className="flex min-h-dvh flex-col text-[13px]">
      <Topbar slug={slug} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
        {projects.isPending && <Loader />}
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
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1 className="font-sans text-lg font-semibold">{p.name}</h1>
                <span className="text-muted-foreground">tasks</span>
                {tasks.data && (
                  <span className="text-xs text-muted-foreground tabular-nums">{tasks.data.tasks.length}</span>
                )}
              </div>
              <Link href={`/p/${encodeURIComponent(p.slug)}`} className="text-xs text-muted-foreground underline underline-offset-4">
                Back to overview
              </Link>
            </header>

            {tasks.isPending && <Loader />}
            {tasks.isError && (
              <p role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-fail">
                {tasks.error.message}
              </p>
            )}
            {tasks.data && tasks.data.tasks.length === 0 && <EmptyState />}
            {tasks.data && tasks.data.tasks.length > 0 && (
              <div className="grid min-h-[60dvh] gap-3 md:grid-cols-2 lg:grid-cols-4">
                {COLUMNS.map((c) => {
                  const rows = grouped.get(c.id) ?? [];
                  if (c.id === 'unsorted' && rows.length === 0) return null;
                  return <BoardColumn key={c.id} label={c.label} rows={rows} onOpen={setOpen} />;
                })}
              </div>
            )}
          </>
        )}
      </main>
      <TaskSheet row={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}

function BoardColumn({ label, rows, onOpen }: { label: string; rows: TaskRow[]; onOpen: (t: TaskRow) => void }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
      </header>
      <ol className="m-0 grid list-none gap-2 p-2">
        {rows.length === 0 && (
          <li className="border border-dashed border-input px-3 py-4 text-center text-xs text-muted-foreground">
            Empty
          </li>
        )}
        {rows.map((t) => (
          <li key={`${t.sourceId}:${t.importKey}`}>
            <button type="button" className="block w-full text-left" onClick={() => onOpen(t)}>
              <TaskCard row={t} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TaskCard({ row }: { row: TaskRow }) {
  const key = upstreamKey(row);
  const status = statusName(row);
  const labels = row.labels.slice(0, 3);
  const extraLabels = row.labels.length - labels.length;
  return (
    <article className="grid gap-1.5 border border-border bg-background px-2.5 py-2 hover:border-[var(--run)]">
      <div className="flex items-center justify-between gap-2 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
        <span className="truncate font-mono">{key ?? row.importKey}</span>
        <span className="border border-dashed border-input px-1 normal-case tracking-normal">{sourceBadge(row.sourceId)}</span>
      </div>
      <h3 className="m-0 font-sans text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{row.title}</h3>
      {(labels.length > 0 || row.assignees.length > 0 || status !== undefined) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {status !== undefined && <span className="border border-border px-1.5">{status}</span>}
          {labels.map((l) => (
            <span key={l} className="border border-border px-1.5">
              {l}
            </span>
          ))}
          {extraLabels > 0 && <span className="text-muted-foreground">+{extraLabels}</span>}
          {row.assignees.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1">
              <Users aria-hidden className="size-3" />
              {row.assignees.length}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function TaskSheet({ row, onClose }: { row: TaskRow | undefined; onClose: () => void }) {
  const open = row !== undefined;
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full font-sans sm:max-w-xl">
        {row && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                <span className="font-mono">{upstreamKey(row) ?? row.importKey}</span>
                <span className="border border-dashed border-input px-1 normal-case tracking-normal">{sourceBadge(row.sourceId)}</span>
                {statusName(row) !== undefined && (
                  <span className="border border-border px-1.5 normal-case tracking-normal text-foreground">{statusName(row)}</span>
                )}
              </div>
              <SheetTitle className="font-sans text-base leading-snug [overflow-wrap:anywhere]">{row.title}</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                updated {new Date(row.updatedAt).toLocaleString()}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 overflow-y-auto px-4 pb-4 text-[13px]">
              {row.labels.length > 0 && (
                <section className="grid gap-1.5">
                  <h4 className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">labels</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {row.labels.map((l) => (
                      <span key={l} className="border border-border px-1.5 text-xs">{l}</span>
                    ))}
                  </div>
                </section>
              )}
              {row.assignees.length > 0 && (
                <section className="grid gap-1.5">
                  <h4 className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">assignees</h4>
                  <ul className="m-0 grid list-none gap-1 p-0 text-xs">
                    {row.assignees.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </section>
              )}
              {row.acceptance.length > 0 && (
                <section className="grid gap-1.5">
                  <h4 className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">acceptance criteria</h4>
                  <ul className="m-0 grid list-none gap-1 border-l-2 border-border pl-3 text-xs">
                    {row.acceptance.map((line, i) => (
                      <li key={`${i}:${line}`}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}
              {row.nonGoals.length > 0 && (
                <section className="grid gap-1.5">
                  <h4 className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">non-goals</h4>
                  <ul className="m-0 grid list-none gap-1 border-l-2 border-border pl-3 text-xs">
                    {row.nonGoals.map((line, i) => (
                      <li key={`${i}:${line}`}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}
              {row.body !== null && row.body.trim() !== '' && (
                <section className="grid gap-1.5">
                  <h4 className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">description</h4>
                  <pre className="m-0 overflow-x-auto border border-border bg-card px-3 py-2 font-sans text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {row.body}
                  </pre>
                </section>
              )}
              <section className="grid gap-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <div className="grid grid-cols-[96px_1fr] gap-2"><span>source</span><code className="break-all font-mono">{row.sourceId}</code></div>
                <div className="grid grid-cols-[96px_1fr] gap-2"><span>key</span><code className="break-all font-mono">{row.importKey}</code></div>
                <div className="grid grid-cols-[96px_1fr] gap-2"><span>imported</span><span>{new Date(row.importedAt).toLocaleString()}</span></div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyState() {
  return (
    <div className="grid gap-2 border border-dashed border-input px-5 py-10 text-center text-muted-foreground">
      <p className="m-0 font-sans text-base font-semibold text-foreground">No tasks yet</p>
      <p className="m-0 text-xs">Click <b>Import from Jira</b> on the project overview to pull your tickets in.</p>
      <p className="m-0 text-xs">
        <Link href="../" className="text-run underline underline-offset-4 inline-flex items-center gap-1">
          Back to overview <ExternalLink aria-hidden className="size-3" />
        </Link>
      </p>
    </div>
  );
}
