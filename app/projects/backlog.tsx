'use client';
/**
 * A project's backlog on its page: the tasks it holds, and Import, where the backlog importer maps an existing
 * markdown backlog to tasks, the parser taking over if it fails (the Markdown backlog task provider). Pasted, picked
 * from disk or a file in the repo; importing again updates the tasks it made rather than adding copies. Task text came from a file anyone may have written: React renders it as
 * text, never as markup.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { agentImportQuery, importBacklog, type Imported, tasksQuery } from './api.ts';

const small = 'text-[11px] text-muted-foreground';
const head = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';

/** `3 created · 2 updated, read by the importer agent`, or by the parser and why. */
const said = (r: Imported) =>
  `${r.created} created · ${r.updated} updated${r.skipped ? ` · ${r.skipped} skipped (already past the backlog)` : ''}, read by the ${r.by === 'agent' ? 'importer agent' : `parser, because ${r.fallback ?? 'the agent did not'}`}`;

/** The importer agent's import as it goes; the tasks reload once it is done. */
function AgentImport({ projectId, run }: { projectId: string; run: string }) {
  const queryClient = useQueryClient();
  const q = useQuery(agentImportQuery(projectId, run));
  const s = q.data;
  const ended = !!s && s.status !== 'running';
  useEffect(() => {
    if (ended) void queryClient.invalidateQueries({ queryKey: ['tasks', projectId], exact: true });
  }, [ended, projectId, queryClient]);
  const link = (
    <Link href={`/runs?run=${encodeURIComponent(run)}`} className="underline underline-offset-[3px]">
      its run
    </Link>
  );
  if (q.isError) return <p role="alert" className="text-xs text-fail">{q.error.message}</p>;
  if (!s || s.status === 'running') return <p className={small}>The importer agent is reading the backlog and mapping it to tasks; see {link}.</p>;
  if (s.status === 'failed') return <p role="alert" className="text-xs text-fail">{s.error}; see {link}.</p>;
  return <p className={small}>{said(s.imported)}.</p>;
}

function ImportDialog({ projectId, onImported }: { projectId: string; onImported: (r: Awaited<ReturnType<typeof importBacklog>>) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (input: { content?: string; path?: string }) => importBacklog(projectId, input),
    onSuccess: (r) => {
      onImported(r);
      setOpen(false);
      form.reset();
      return queryClient.invalidateQueries({ queryKey: ['tasks', projectId], exact: true });
    },
  });
  const form = useForm({
    defaultValues: { content: '', path: '' },
    onSubmit: ({ value }) => run.mutate(value.path.trim() ? { path: value.path.trim() } : { content: value.content }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileUp aria-hidden className="size-3.5" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-sans">Import a markdown backlog</DialogTitle>
            <DialogDescription>
              The backlog importer reads it and maps each piece of work to a task, with its acceptance criteria and non-goals when the backlog gives them. If it fails, the parser reads it instead: a <code>##</code> heading per task, or
              a heading over <code>- **Title** — text</code> bullets. Importing again updates tasks still in the backlog; it never adds copies.
            </DialogDescription>
          </DialogHeader>
          <form.Field name="content">
            {(f) => (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="bl-content">Paste it</Label>
                  <Input
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    aria-label="Or choose a file"
                    className="h-7 w-56 text-xs"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) f.handleChange(await file.text());
                    }}
                  />
                </div>
                <Textarea id="bl-content" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={12} spellCheck={false} className="max-h-[50vh] font-mono text-xs" placeholder={'## Add OAuth login\nSupport Google and GitHub.\n\n### Acceptance criteria\n- Both buttons sign in'} />
              </div>
            )}
          </form.Field>
          <form.Field name="path">
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="bl-path">Or a file in the repo</Label>
                <Input id="bl-path" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="docs/backlog.md" spellCheck={false} className="font-mono" />
              </div>
            )}
          </form.Field>
          {run.error && (
            <p role="alert" className="text-xs text-fail">
              {run.error.message}
            </p>
          )}
          <DialogFooter>
            <form.Subscribe selector={(s) => !s.values.content.trim() && !s.values.path.trim()}>
              {(empty) => (
                <Button type="submit" size="sm" disabled={empty || run.isPending}>
                  {run.isPending ? 'Importing…' : 'Import'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Backlog({ projectId }: { projectId: string }) {
  const tasks = useQuery(tasksQuery(projectId));
  const [last, setLast] = useState<{ imported: Imported } | { run: string }>();
  const list = (tasks.data ?? []).filter((t) => t.status === 'backlog');
  return (
    <section className="grid gap-2" aria-label="backlog">
      <div className="flex items-center justify-between gap-3">
        <div className={head}>
          backlog
          {list.length > 0 && <span className="normal-case tracking-normal"> · {list.length}</span>}
        </div>
        <ImportDialog projectId={projectId} onImported={setLast} />
      </div>
      {last && 'imported' in last && <p className={small}>{said(last.imported)}.</p>}
      {last && 'run' in last && <AgentImport key={last.run} projectId={projectId} run={last.run} />}
      {tasks.isSuccess && list.length === 0 && <span className={small}>no tasks yet: import a markdown backlog</span>}
      {list.length > 0 && (
        <ul className="border border-border bg-card">
          {list.map((t) => (
            <li key={t.id} className="grid gap-0.5 border-b border-border px-3 py-2 last:border-b-0">
              <b className="text-xs font-semibold break-words">{t.title}</b>
              {t.body && <span className="line-clamp-2 text-xs break-words whitespace-pre-wrap text-[var(--ink-2)]">{t.body}</span>}
              <span className={small}>
                {t.importKey ? <code>{t.importKey}</code> : 'made by hand'}
                {t.acceptanceCriteria.length > 0 && <> · {t.acceptanceCriteria.length} acceptance criteria</>}
                {t.nonGoals.length > 0 && <> · {t.nonGoals.length} non-goals</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tasks.isError && (
        <p role="alert" className="text-xs text-fail">
          {tasks.error.message}
        </p>
      )}
    </section>
  );
}
