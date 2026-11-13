'use client';
/** The New run sheet: a flow from the library, the folder it works in, the task, and an optional budget. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flowQuery, libraryQuery } from '../flows/api.ts';
import { startRun } from './api.ts';

const FOLDER_KEY = 'flowboard.newRun.folder';
const remembered = () => {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
};

export function NewRun({ flow: initial = '', folder: initialFolder, onStarted, onClose }: { flow?: string; folder?: string; onStarted: (name: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const library = useQuery(libraryQuery);
  const [flow, setFlow] = useState(initial);
  const [folder, setFolder] = useState(() => initialFolder || remembered());
  const [task, setTask] = useState('');
  const [budget, setBudget] = useState('');
  const [allowDirty, setAllowDirty] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const flows = library.data?.flows ?? [];
  const picked = flows.find((f) => f.name === flow) ?? flows.find((f) => f.errors === 0) ?? flows[0];
  // A flow that fails the check can be picked, to see why; the list carries only the count, the file the lines.
  const broken = !!picked && picked.errors > 0;
  const checked = useQuery({ ...flowQuery(picked?.name ?? ''), enabled: broken });
  const start = useMutation({
    mutationFn: () =>
      startRun({ flow: picked!.name, folder: folder.trim(), task, ...(budget !== '' && { budgetUsd: Number(budget) }), ...(allowDirty && { allowDirty }) }),
    onSuccess: ({ name }) => {
      try {
        localStorage.setItem(FOLDER_KEY, folder.trim());
      } catch {
        // a per-browser convenience only
      }
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      onStarted(name);
      ref.current?.close();
    },
  });
  const ready = !!picked && picked.errors === 0 && folder.trim() !== '' && task.trim() !== '' && (budget === '' || Number(budget) >= 0);
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
            <em className="lbl hint">a git repository; every step works here</em>
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
          <button type="submit" className="act primary" disabled={!ready || start.isPending}>
            {start.isPending ? 'Starting…' : 'Start run'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
