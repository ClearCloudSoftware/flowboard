'use client';
/**
 * "Import from Jira" button for the project page, with a floating progress
 * toast that polls `/api/imports/<id>` every 1.5s until the import leaves
 * the 'running' state.
 *
 * Disabled when no Jira credential is configured — hover text points the
 * operator at Settings → Connections. Clicking POSTs to `/api/import/jira`,
 * which returns the importId immediately (the actual drain runs in the
 * background on the server). The toast then tracks progress.
 *
 * A second click while an import is still running returns the same id from
 * the server-side runningImports dedup map — the UI mirrors that by locking
 * the button once we have an id in local state.
 *
 * See docs/superpowers/plans/2026-11-19-task-storage-and-intake.md Task 6.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '../flows/api.ts';
import { importQuery, jiraStatusQuery, startJiraImport } from './api.ts';

export function ImportFromJira({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  const queryClient = useQueryClient();
  const jira = useQuery(jiraStatusQuery);
  const [importId, setImportId] = useState<string | undefined>(undefined);

  const start = useMutation({
    mutationFn: () => startJiraImport(projectId),
    onSuccess: (r) => setImportId(r.importId),
  });

  const loaded = jira.data !== undefined;
  const connected = jira.data?.connected === true;
  const disabled = !loaded || !connected || start.isPending || importId !== undefined;
  const title = !loaded
    ? 'Checking Jira connection…'
    : !connected
      ? 'No Jira credentials — connect in Settings → Connections → Jira'
      : start.isPending
        ? 'Starting an import…'
        : importId !== undefined
          ? 'An import is already running for this project'
          : undefined;

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} title={title} onClick={() => start.mutate()}>
        <Download aria-hidden /> Import from Jira
      </Button>
      {start.error && !importId && (
        <p role="alert" className="text-xs text-fail">
          {start.error.message}
        </p>
      )}
      {importId !== undefined && (
        <ImportToast
          importId={importId}
          projectSlug={projectSlug}
          onClose={() => {
            setImportId(undefined);
            void queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
          }}
        />
      )}
    </>
  );
}

function ImportToast({ importId, projectSlug, onClose }: { importId: string; projectSlug: string; onClose: () => void }) {
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
      {state === 'done' && (
        <Link href={`/p/${projectSlug}/tasks`} className="text-xs text-run underline underline-offset-4">
          Open the board
        </Link>
      )}
    </div>
  );
}
