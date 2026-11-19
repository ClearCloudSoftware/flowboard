'use client';
/**
 * "Import from Jira" button for the project page.
 *
 * The button opens a small dialog that asks for a JQL query (pre-filled
 * with the operator's saved default if any). On submit it POSTs to
 * `/api/import/jira?project=<id>&jql=<q>`, closes the dialog, and opens
 * a floating progress toast that polls `GET /api/imports/<id>` every
 * 1.5s until the import leaves 'running'.
 *
 * Why a dialog and not a one-click launcher: the OAuth connection path
 * has no place to save a default JQL (only the API-token tab exposes
 * one), and "silently import everything I can see" is the wrong default
 * when a credential may cover thousands of tickets across dozens of
 * projects. A dialog with a pre-filled default is friction-free when a
 * default is saved, and the only way to start otherwise.
 *
 * A second click while an import is still running is blocked at the UI
 * level (local importId state) and also at the server (runningImports
 * dedup map returns the first id).
 *
 * See docs/superpowers/plans/2026-11-19-task-storage-and-intake.md Task 6.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '../flows/api.ts';
import { importQuery, jiraStatusQuery, startJiraImport } from './api.ts';

const JQL_PLACEHOLDER = 'project = KAN AND statusCategory != Done ORDER BY updated DESC';

export function ImportFromJira({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const jira = useQuery(jiraStatusQuery);
  const [open, setOpen] = useState(false);
  const [jql, setJql] = useState('');
  const [importId, setImportId] = useState<string | undefined>(undefined);

  const start = useMutation({
    mutationFn: (q: string) => startJiraImport(projectId, q),
    onSuccess: (r) => {
      setImportId(r.importId);
      setOpen(false);
    },
  });

  const loaded = jira.data !== undefined;
  const connected = jira.data?.connected === true;
  const savedDefault = jira.data?.defaultJql ?? '';
  const effective = jql.trim() !== '' ? jql.trim() : savedDefault;

  const triggerDisabled = !loaded || !connected || importId !== undefined;
  const triggerTitle = !loaded
    ? 'Checking Jira connection…'
    : !connected
      ? 'No Jira credentials — connect in Settings → Connections → Jira'
      : importId !== undefined
        ? 'An import is already running for this project'
        : undefined;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setJql(savedDefault);
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={triggerDisabled} title={triggerTitle}>
            <Download aria-hidden /> Import from Jira
          </Button>
        </DialogTrigger>
        <DialogContent className="font-sans sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-sans">Import from Jira</DialogTitle>
            <DialogDescription>
              Issues matching the query below are upserted into this project. Re-running the
              same query is idempotent — nothing is duplicated.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (effective === '') return;
              start.mutate(effective);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="import-jql">JQL</Label>
              <Input
                id="import-jql"
                value={jql}
                onChange={(e) => setJql(e.target.value)}
                placeholder={savedDefault || JQL_PLACEHOLDER}
                autoFocus
                spellCheck={false}
                className="font-mono"
              />
              <em className="text-xs text-muted-foreground not-italic">
                {savedDefault
                  ? <>Leave blank to use the saved default: <code className="font-mono">{savedDefault}</code></>
                  : <>No default saved. Save one on <code className="font-mono">Settings → Connections → Jira</code> to skip this step next time.</>}
              </em>
            </div>
            {start.error && (
              <p role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-2 py-1 text-xs whitespace-pre-wrap break-words text-fail">
                {start.error.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={start.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={start.isPending || effective === ''}>
                {start.isPending ? 'Starting…' : 'Import'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {importId !== undefined && (
        <ImportToast
          importId={importId}
          onClose={() => {
            setImportId(undefined);
            void queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
          }}
        />
      )}
    </>
  );
}

function ImportToast({ importId, onClose }: { importId: string; onClose: () => void }) {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery(importQuery(importId));
  const row = q.data;
  const state = row?.state;
  const total = row ? row.created + row.updated : 0;
  const err = row?.error ?? (q.error instanceof ApiError ? q.error.message : undefined);

  const title =
    row === undefined
      ? 'Starting Jira import…'
      : state === 'running'
        ? 'Importing from Jira…'
        : state === 'done'
          ? `Imported ${total} ${total === 1 ? 'task' : 'tasks'}`
          : state === 'failed'
            ? 'Jira import failed'
            : 'Jira import cancelled';

  const accent =
    state === 'failed'
      ? 'border-fail bg-[var(--fail-soft)]'
      : state === 'done'
        ? 'border-run bg-card'
        : 'border-border bg-card';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 bottom-4 z-50 grid w-[320px] gap-2 border border-border border-l-2 ${accent} px-3 py-2 shadow-lg`}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="font-sans text-sm font-semibold">{title}</b>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {row && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {row.created} created · {row.updated} updated · {row.pages} {row.pages === 1 ? 'page' : 'pages'}
        </p>
      )}
      {err && (
        <p role="alert" className="text-xs whitespace-pre-wrap break-words text-fail">
          {err}
        </p>
      )}
      {state === 'done' && slug !== undefined && (
        <Link href={`/p/${encodeURIComponent(slug)}/tasks`} className="text-xs text-run underline underline-offset-4">
          Open the board
        </Link>
      )}
    </div>
  );
}
