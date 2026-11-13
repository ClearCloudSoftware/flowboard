'use client';
/**
 * The New run sheet: a flow from the library, the folder it works in (the repo folder itself, or a task's own
 * workspace in it), the task, and an optional budget.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flowQuery, libraryQuery } from '../flows/api.ts';
import { FOLDER_KEY, previewQuery, rememberedFolder as remembered, workspacesQuery } from '../workspaces/api.ts';
import type { Preview } from '../workspaces/api.ts';
import { startRun } from './api.ts';

/** A task id from the task's first words: `Make the Stripe webhook idempotent` → `make-the-stripe-webhook`. */
const slug = (task: string) =>
  task.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 4).join('-');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function NewRun({ flow: initial = '', workspace: initialWs, folder: initialFolder, onStarted, onClose }: { flow?: string; workspace?: string; folder?: string; onStarted: (name: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const library = useQuery(libraryQuery);
  const [flow, setFlow] = useState(initial);
  const [folder, setFolder] = useState(() => initialFolder || remembered());
  const [mode, setMode] = useState<'folder' | 'workspace'>(initialWs ? 'workspace' : 'folder');
  const [wsId, setWsId] = useState(initialWs ?? '');
  const [task, setTask] = useState('');
  const [budget, setBudget] = useState('');
  const [allowDirty, setAllowDirty] = useState(false);
  const id = mode === 'workspace' ? wsId.trim() : '';
  const [asked] = useDebouncedValue(`${folder.trim()}\n${id}`, { wait: 250 });
  const [askedFolder, askedId] = asked.split('\n');
  const preview = useQuery({ ...previewQuery(askedFolder, askedId), enabled: askedFolder !== '' && (mode === 'folder' || askedId !== '') });
  const existing = useQuery({ ...workspacesQuery(askedFolder), enabled: askedFolder !== '' && mode === 'workspace' });
  const pv = asked === `${folder.trim()}\n${id}` ? preview.data : undefined;
  useEffect(() => ref.current?.showModal(), []);
  const flows = library.data?.flows ?? [];
  const picked = flows.find((f) => f.name === flow) ?? flows.find((f) => f.errors === 0) ?? flows[0];
  // A flow that fails the check can be picked, to see why; the list carries only the count, the file the lines.
  const broken = !!picked && picked.errors > 0;
  const checked = useQuery({ ...flowQuery(picked?.name ?? ''), enabled: broken });
  const start = useMutation({
    mutationFn: () =>
      startRun({ flow: picked!.name, folder: folder.trim(), task, ...(budget !== '' && { budgetUsd: Number(budget) }), ...(allowDirty && { allowDirty }), ...(id && { workspace: id }) }),
    onSuccess: ({ name }) => {
      try {
        localStorage.setItem(FOLDER_KEY, folder.trim());
      } catch {
        // a per-browser convenience only
      }
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onStarted(name);
      ref.current?.close();
    },
  });
  // Start waits on what the preview refuses; run-flow checks the same things again when it starts.
  const blocked = pv?.refused ?? (mode === 'workspace' && !ID.test(id) ? 'name the task workspace' : pv?.outcome === 'dirty' && !allowDirty ? 'tick “run even with uncommitted changes” to keep working on them' : undefined);
  const ready = !!picked && picked.errors === 0 && folder.trim() !== '' && task.trim() !== '' && (budget === '' || Number(budget) >= 0) && !blocked;
  const command = `pnpm run-flow --folder ${folder.trim() || '<dir>'} --task <file>${id ? ` --workspace ${id}` : ''}${allowDirty ? ' --allow-dirty' : ''}${budget !== '' ? ` --budget-usd ${budget}` : ''} ${picked ? `flows/${picked.name}.yaml` : '<flow.yaml>'}`;
  return (
    <dialog ref={ref} className="pe nr" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) start.mutate();
        }}
      >
        <div className="ph">
          <span className="lbl">new run</span>
          <span className="sp" />
          <span className="lbl hint">run-flow --page, in the background</span>
        </div>
        <div className="nr-b in-f">
          <label htmlFor="nr-flow">Flow</label>
          <span className="in-v">
            <select id="nr-flow" value={picked?.name ?? ''} onChange={(e) => setFlow(e.target.value)}>
              {flows.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} · {f.steps.length} steps{f.budgetUsd ? ` · $${f.budgetUsd} ceiling` : ''}
                  {f.errors > 0 ? ' · does not pass the check' : ''}
                </option>
              ))}
            </select>
            {picked?.description && <em className="lbl hint">{picked.description}</em>}
          </span>
          <label htmlFor="nr-folder">Folder</label>
          <span className="in-v">
            <input id="nr-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/code/my-repo" spellCheck={false} autoComplete="off" />
            <em className="lbl hint">a git repository</em>
          </span>
          <label htmlFor="nr-ws">Work in</label>
          <span className="in-v">
            <span className="nr-mode" role="radiogroup" aria-label="Where the run works">
              <label aria-checked={mode === 'folder'}>
                <input type="radio" name="nr-mode" checked={mode === 'folder'} onChange={() => setMode('folder')} /> the repo folder
                <em>one run at a time</em>
              </label>
              <label aria-checked={mode === 'workspace'}>
                <input type="radio" name="nr-mode" checked={mode === 'workspace'} onChange={() => setMode('workspace')} /> a task workspace
                <em>its own worktree and branch</em>
              </label>
            </span>
            {mode === 'workspace' && (
              <span className="nr-ws">
                <input
                  id="nr-ws"
                  aria-label="Task id"
                  value={wsId}
                  onChange={(e) => setWsId(e.target.value)}
                  placeholder={slug(task) || 'stripe-webhook-idempotency'}
                  list="nr-ws-ids"
                  spellCheck={false}
                  autoComplete="off"
                />
                {!wsId && slug(task) && (
                  <button type="button" className="act" onClick={() => setWsId(slug(task))}>
                    use {slug(task)}
                  </button>
                )}
                <datalist id="nr-ws-ids">
                  {existing.data?.rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.state}
                    </option>
                  ))}
                </datalist>
              </span>
            )}
            <WorkspacePreview pv={pv} mode={mode} />
          </span>
          <label htmlFor="nr-task">Task</label>
          <span className="in-v">
            <textarea id="nr-task" rows={8} value={task} onChange={(e) => setTask(e.target.value)} placeholder="What the flow should do. It starts every agent step's prompt." />
          </span>
          <label htmlFor="nr-budget">Budget</label>
          <span className="in-v">
            <input id="nr-budget" type="number" min={0} step={0.1} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={picked?.budgetUsd ? `${picked.budgetUsd} (the flow's)` : "the flow's"} />
          </span>
          <span />
          <label className="check">
            <input type="checkbox" checked={allowDirty} onChange={(e) => setAllowDirty(e.target.checked)} /> run even with uncommitted changes in the folder
          </label>
          <span />
          <code className="nr-cmd">$ {command}</code>
        </div>
        {broken && (
          <div className="nr-err" role="alert">
            {checked.data?.check.errors.join('\n') ?? `${picked.name} does not pass the check`}
            {'\n'}
            <Link href={`/flows?flow=${encodeURIComponent(picked.name)}`}>Fix in the designer</Link>
          </div>
        )}
        {start.error && <pre className="nr-err">{start.error.message}</pre>}
        <div className="pe-f">
          <span className="sp" />
          <button type="button" className="act" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          {blocked && <em className="lbl plain nr-why">{blocked}</em>}
          <button type="submit" className="act primary" disabled={!ready || start.isPending}>
            {start.isPending ? 'Starting…' : 'Start run'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** What Start would do with the folder or workspace as typed; quiet when all is well, brick when it would refuse. */
function WorkspacePreview({ pv, mode }: { pv?: Preview; mode: 'folder' | 'workspace' }) {
  if (!pv) return null;
  if (pv.refused) return <span className="nr-pv bad">{pv.refused}</span>;
  if (mode === 'folder') return <span className="nr-pv">every step works in {pv.folder}</span>;
  const ahead = pv.ahead ? `${pv.ahead} commit${pv.ahead === 1 ? '' : 's'} ahead` : 'nothing committed yet';
  const said = {
    new: `new: ${pv.branch}, cut from ${pv.from}`,
    reused: `picked up again: ${ahead}${pv.lastCommit ? ` · last ${pv.lastCommit.sha} ${pv.lastCommit.subject}` : ''}`,
    'branch-only': `the folder was removed; ${pv.branch} (${ahead}) is checked out again`,
    dirty: `picked up again with ${pv.uncommitted} uncommitted file${pv.uncommitted === 1 ? '' : 's'} from an earlier run`,
  }[pv.outcome ?? 'new'];
  return (
    <span className={`nr-pv ${pv.outcome === 'dirty' ? 'wait' : ''}`}>
      {said}
      <br />
      steps work in {pv.folder}
    </span>
  );
}
