'use client';
/** The workspaces screen (docs/mockups/workspaces.html): every task worktree in one repo, what each needs, and clean up. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, FolderGit2, GitBranch, GitMerge, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cleanUp, cli, rememberedFolder, workspacesQuery } from './api.ts';
import type { ActResult, WorkspaceRow, WorkspaceState } from './api.ts';

const NEEDS: ReadonlySet<WorkspaceState> = new Set(['dirty', 'unmerged', 'broken']);
const SAYS: Record<WorkspaceState, (r: WorkspaceRow) => string> = {
  running: (r) => `running${r.pid ? ` · pid ${r.pid}` : ''}`,
  dirty: (r) => `${r.uncommitted.length} uncommitted`,
  unmerged: (r) => `${r.ahead} to land`,
  broken: () => 'broken',
  merged: () => 'merged · safe to clean up',
  'branch-only': () => 'folder gone · branch kept',
};
const tone = (s: WorkspaceState) => (s === 'running' ? 'live' : s === 'broken' ? 'bad' : NEEDS.has(s) ? 'wait' : 'done');
const href = (path: string, q: Record<string, string>) => `${path}?${new URLSearchParams(q)}`;

export function Workspaces() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  // useSearchParams renders this in the browser only, so the remembered folder can seed the state directly.
  const [folder, setFolder] = useState(() => params.get('folder') || rememberedFolder());
  const [typed, setTyped] = useState(folder);
  const list = useQuery(workspacesQuery(folder));
  const rows = list.data?.rows ?? [];
  const ordered = [...rows.filter((r) => NEEDS.has(r.state)), ...rows.filter((r) => r.state === 'running'), ...rows.filter((r) => !NEEDS.has(r.state) && r.state !== 'running')];
  const [pickedId, setPicked] = useState(() => params.get('id') ?? '');
  const picked = rows.find((r) => r.id === pickedId);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ id: string; text: string; bad: boolean; cmd: string } | undefined>();
  const [confirm, setConfirm] = useState<WorkspaceRow | undefined>();

  const open = (f: string) => {
    setFolder(f);
    router.replace(href('/workspaces', { folder: f }));
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspaces', folder] });
  async function clean(r: WorkspaceRow, force: boolean) {
    // uncommitted work: ask before throwing it away, rather than showing git's refusal
    if (!force && r.uncommitted.length) return setConfirm(r);
    setBusy(true);
    const res: ActResult = await cleanUp(folder, r.id, force);
    setBusy(false);
    setConfirm(undefined);
    const cmd = cli.clean(folder, r.id, force);
    if (!res.ok) return setOutcome({ id: r.id, text: res.error, bad: true, cmd });
    setOutcome({ id: r.id, bad: false, cmd, text: res.branchKept ? `removed ${r.id}; kept branch ${res.branchKept}: it has commits not merged into ${list.data?.repo.base}. Delete it with git branch -D ${res.branchKept}` : `removed ${r.id} and its branch` });
    void refresh();
  }
  async function cleanMerged() {
    const merged = rows.filter((r) => r.state === 'merged');
    setBusy(true);
    const refusals: string[] = [];
    for (const r of merged) {
      const res = await cleanUp(folder, r.id, false);
      if (!res.ok) refusals.push(`${r.id}: ${res.error}`);
    }
    setBusy(false);
    const text = `removed ${merged.length - refusals.length} merged workspace(s)${refusals.length ? `; refused ${refusals.join('; ')}` : ''}`;
    setOutcome({ id: '', bad: refusals.length > 0, cmd: merged.map((r) => cli.clean(folder, r.id, false)).join(' && '), text });
    void refresh();
  }
  const cleanable = (r: WorkspaceRow) => r.state !== 'running' && r.state !== 'broken';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = ordered.findIndex((r) => r.id === pickedId);
      if (e.key === 'j' || e.key === 'k') setPicked(ordered[Math.max(0, Math.min(ordered.length - 1, k + (e.key === 'j' ? 1 : -1)))]?.id ?? '');
      else if (e.key === 'Escape') setPicked('');
      else if (e.key === 'c' && picked && cleanable(picked) && !busy) void clean(picked, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const needs = ordered.filter((r) => NEEDS.has(r.state));
  const rest = ordered.filter((r) => !NEEDS.has(r.state));
  const merged = rows.filter((r) => r.state === 'merged').length;
  const row = (r: WorkspaceRow) => (
    <button key={r.id} type="button" className={`ws-row ${tone(r.state)}`} aria-current={r.id === pickedId} onClick={() => setPicked(r.id === pickedId ? '' : r.id)}>
      <i className={`lg-dot ${tone(r.state)}`} />
      <b>{r.id}</b>
      <span className="ws-br">{r.branch}</span>
      <span className="ws-n">{r.ahead ? `↑${r.ahead}` : ''}{r.behind ? ` ↓${r.behind}` : ''}</span>
      <span className="ws-say">{SAYS[r.state](r)}</span>
      <span className="ws-last">{r.lastRun ? `${r.lastRun.flow} · ${r.lastRun.status}` : r.lastCommit ? r.lastCommit.when : ''}</span>
    </button>
  );

  return (
    <div className="fd">
      <header className="topbar">
        <div className="brand">
          flowboard<em>/</em>
          <span>workspaces</span>
        </div>
        <form
          className="ws-folder"
          onSubmit={(e) => {
            e.preventDefault();
            open(typed.trim());
          }}
        >
          <FolderGit2 size={14} aria-hidden />
          <input aria-label="Repository folder" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="~/code/my-repo" spellCheck={false} />
          {list.data && (
            <span className="lbl plain">
              {list.data.repo.base} @ {list.data.repo.head}
            </span>
          )}
        </form>
        <span className="sp" />
        <button type="button" className="act" disabled={!merged || busy} onClick={() => void cleanMerged()} title="Removes every workspace whose branch is merged and that holds no uncommitted work">
          <Trash2 size={13} aria-hidden />
          Clean up merged ({merged})
        </button>
        <Link className="act" href="/runs">
          Runs
        </Link>
        <Link className="act" href="/flows">
          Flows
        </Link>
      </header>
      <div className={`body ws-body ${picked ? 'with-side' : ''}`}>
        <main className="pane">
          {!folder && <div className="in-empty">Name a repository folder above to see its task workspaces.</div>}
          {list.isError && <div className="in-empty">{list.error.message}</div>}
          {list.data && rows.length === 0 && (
            <div className="in-empty">
              No task workspaces in {list.data.repo.root}. Start a run with a task workspace from <Link href="/runs?new=1">+ New run</Link>.
            </div>
          )}
          {needs.length > 0 && (
            <section className="ws-needs">
              <div className="ws-needs-h">
                <AlertTriangle size={13} aria-hidden /> needs you · {needs.length}
              </div>
              {needs.map(row)}
            </section>
          )}
          {rest.length > 0 && (
            <section>
              <div className="ph">
                <span className="lbl">running and done</span>
                <span className="sp" />
                <span className="lbl">{rest.length}</span>
              </div>
              {rest.map(row)}
            </section>
          )}
          {outcome && (
            <div className={`ws-out ${outcome.bad ? 'bad' : ''}`} role="status">
              <span>{outcome.text}</span>
              <code>$ {outcome.cmd}</code>
            </div>
          )}
        </main>
        {picked && <Side r={picked} folder={folder} base={list.data!.repo.base} busy={busy} onClean={() => void clean(picked, false)} cleanable={cleanable(picked)} />}
      </div>
      <footer className="ws-keys lbl plain">
        j / k move · c clean up · esc close · polled every 4 s, so a run finishing frees its row
      </footer>
      {confirm && <Confirm r={confirm} folder={folder} busy={busy} onCancel={() => setConfirm(undefined)} onForce={() => void clean(confirm, true)} />}
    </div>
  );
}

function Side({ r, folder, base, busy, cleanable, onClean }: { r: WorkspaceRow; folder: string; base: string; busy: boolean; cleanable: boolean; onClean: () => void }) {
  const why = r.state === 'running' ? 'a run is working in it; let it finish or stop it first' : r.state === 'broken' ? 'fix it first: clean up cannot tell what is safe to remove' : '';
  return (
    <aside className="pane ws-side">
      <div className="ph">
        <span className="lbl">task</span>
        <b>{r.id}</b>
        <span className="sp" />
        <span className={`rv-pill ${tone(r.state)}`}>{SAYS[r.state](r)}</span>
      </div>
      <dl className="ws-dl">
        <dt>branch</dt>
        <dd>
          <GitBranch size={12} aria-hidden /> {r.branch} · {r.ahead} ahead, {r.behind} behind {base}
        </dd>
        <dt>folder</dt>
        <dd className="ws-path">
          {r.state === 'branch-only' ? <em>gone; the next run with this task id makes it again</em> : r.path}
          {r.state !== 'branch-only' && (
            <button type="button" className="act" title="Copy the path" onClick={() => void navigator.clipboard?.writeText(r.path)}>
              <Copy size={12} aria-hidden />
              copy
            </button>
          )}
        </dd>
        {r.lastCommit && (
          <>
            <dt>last commit</dt>
            <dd>
              {r.lastCommit.sha} <span className="sans">{r.lastCommit.subject}</span> · {r.lastCommit.when}
            </dd>
          </>
        )}
        {r.lastRun && (
          <>
            <dt>last run</dt>
            <dd>
              <Link href={`/runs?run=${encodeURIComponent(r.lastRun.name)}`}>{r.lastRun.flow}</Link> · {r.lastRun.status}
            </dd>
          </>
        )}
      </dl>
      {r.problem && (
        <div className="ws-problem">
          <b>{r.problem}</b>
          <code>$ {r.fix}</code>
        </div>
      )}
      {r.uncommitted.length > 0 && (
        <div className="ws-files">
          <span className="lbl">uncommitted · not on the branch yet</span>
          {r.uncommitted.map((f) => (
            <code key={f}>{f}</code>
          ))}
        </div>
      )}
      <div className="ws-acts">
        {r.ahead > 0 && r.state !== 'broken' && (
          <Link className="act primary" href={href('/workspaces/land', { folder, id: r.id })}>
            <GitMerge size={13} aria-hidden />
            Review and land
          </Link>
        )}
        {r.state !== 'running' && r.state !== 'broken' && (
          <Link className="act" href={href('/runs', { new: r.lastRun?.flow ?? '1', workspace: r.id, folder })}>
            <Play size={13} aria-hidden />
            Run again
          </Link>
        )}
        <button type="button" className="act danger" disabled={!cleanable || busy} title={why} onClick={onClean}>
          <Trash2 size={13} aria-hidden />
          Clean up
        </button>
        {why && <em className="lbl plain">{why}</em>}
        <code className="ws-cmd">$ {cli.clean(folder, r.id, false)}</code>
      </div>
    </aside>
  );
}

function Confirm({ r, folder, busy, onCancel, onForce }: { r: WorkspaceRow; folder: string; busy: boolean; onCancel: () => void; onForce: () => void }) {
  return (
    <dialog open className="pe ws-confirm" onClose={onCancel}>
      <div className="ph">
        <span className="lbl">clean up {r.id}</span>
      </div>
      <div className="ws-confirm-b">
        <p className="sans">
          The workspace holds work that was never committed. Cleaning it up throws these away for good; the branch keeps only what was committed.
        </p>
        {r.uncommitted.map((f) => (
          <code key={f}>{f}</code>
        ))}
        <code className="ws-cmd">$ {cli.clean(folder, r.id, true)}</code>
      </div>
      <div className="pe-f">
        <span className="sp" />
        <button type="button" className="act" onClick={onCancel} autoFocus>
          Keep it
        </button>
        <button type="button" className="act danger" disabled={busy} onClick={onForce}>
          Throw away {r.uncommitted.length} file{r.uncommitted.length === 1 ? '' : 's'}
        </button>
      </div>
    </dialog>
  );
}
