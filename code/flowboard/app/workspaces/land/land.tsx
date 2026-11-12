'use client';
/**
 * Landing a task (docs/mockups/land-workspace.html): review its branch against the base, commit by commit; land it in
 * the repo's own checkout after a dry run; then clean up. The host does all of it; agents never touch the base.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, GitBranch, GitCommitHorizontal, GitMerge, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cleanUp, cli, diffQuery, dryRun, landBranch, reviewQuery, updateFromBase } from '../api.ts';
import type { ActResult, Commit, DryRun, Review, Strategy } from '../api.ts';
import { Diff } from '../diff.tsx';

const STRATS: Record<Strategy, { name: string; says: (base: string) => string; cmd: (root: string, base: string, branch: string, path: string) => string }> = {
  merge: {
    name: 'Merge commit',
    says: (base) => `One new commit on ${base} joins the branch in; its commits keep their history. Clean up can delete the branch afterwards: git sees it as merged.`,
    cmd: (root, _b, branch) => `git -C ${root} merge --no-ff -m <message> ${branch}`,
  },
  squash: {
    name: 'Squash',
    says: (base) => `The whole branch becomes one commit on ${base}. git cannot tell the branch was merged, so clean up keeps it and tells you how to delete it.`,
    cmd: (root, _b, branch) => `git -C ${root} merge --squash ${branch} && git -C ${root} commit -m <message>`,
  },
  ff: {
    name: 'Rebase, then fast-forward',
    says: (base) => `The commits are replayed on top of ${base} in the workspace, then ${base} moves forward to them. No commit of its own, so the message is not used.`,
    cmd: (root, base, branch, path) => `git -C ${path} rebase ${base} && git -C ${root} merge --ff-only ${branch}`,
  },
};

type Stage = 1 | 2 | 3;

export function Land() {
  const params = useSearchParams();
  const folder = params.get('folder') ?? '';
  const id = params.get('id') ?? '';
  const queryClient = useQueryClient();
  const rv = useQuery(reviewQuery(folder, id));
  const [stage, setStage] = useState<Stage>(1);
  const [skipped, setSkipped] = useState(false);
  const [landed, setLanded] = useState<{ head: string; strategy: Strategy; note?: string } | undefined>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace', folder, id] }).then(() => queryClient.invalidateQueries({ queryKey: ['workspace-diff', folder, id] }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1' || (e.key === '2' && !skipped) || (e.key === '3' && (landed || skipped))) setStage(Number(e.key) as Stage);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = rv.data;
  const stages: Array<[Stage, string, boolean]> = [
    [1, 'Review', true],
    [2, 'Land', !skipped],
    [3, 'Clean up', !!landed || skipped],
  ];
  return (
    <div className="fd">
      <header className="topbar">
        <Link className="act" href={`/workspaces?folder=${encodeURIComponent(folder)}&id=${encodeURIComponent(id)}`}>
          <ArrowLeft size={13} aria-hidden />
          Workspaces
        </Link>
        <div className="brand">
          {id}
          <em>/</em>
          <span>land</span>
        </div>
        {r && (
          <span className="lbl plain">
            <GitBranch size={12} aria-hidden /> {r.row.branch} → {r.repo.base} @ {r.repo.head}
          </span>
        )}
        <span className="sp" />
        <nav className="ln-steps" aria-label="Stages">
          {stages.map(([n, name, can]) => (
            <button key={n} type="button" aria-current={stage === n} disabled={!can} onClick={() => setStage(n)}>
              {n} {name}
            </button>
          ))}
        </nav>
      </header>
      <main className="ln-body">
        {rv.isError && <div className="in-empty">{rv.error.message}</div>}
        {rv.isPending && folder && <div className="in-empty">Reading {id}…</div>}
        {r && stage === 1 && (
          <ReviewStage
            r={r}
            folder={folder}
            onLand={() => setStage(2)}
            onSkip={() => {
              setSkipped(true);
              setStage(3);
            }}
          />
        )}
        {r && stage === 2 && (
          <LandStage
            r={r}
            folder={folder}
            onLanded={(head, strategy, note) => {
              setLanded({ head, strategy, ...(note && { note }) });
              void refresh();
              setStage(3);
            }}
            onUpdated={() => void refresh()}
          />
        )}
        {r && stage === 3 && <CleanStage r={r} folder={folder} landed={landed} />}
      </main>
      <footer className="ws-keys lbl plain">1 2 3 stages · [ ] commits · e expand all · every command below runs on this machine, never in an agent</footer>
    </div>
  );
}

/* ── 1 Review ────────────────────────────────────────────── */

function ReviewStage({ r, folder, onLand, onSkip }: { r: Review; folder: string; onLand: () => void; onSkip: () => void }) {
  const [view, setView] = useState(''); // '' = the whole branch
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const diff = useQuery(diffQuery(folder, r.row.id, view));
  const order = ['', ...r.commits.map((c) => c.sha)];
  const pick = (sha: string) => {
    setView(sha);
    document.getElementById('files')?.scrollIntoView({ block: 'start' });
  };
  const step = (by: number) => {
    const k = Math.max(0, order.indexOf(view));
    pick(order[Math.max(0, Math.min(order.length - 1, k + by))]);
  };
  const files = diff.data ?? [];
  const key = (path: string) => `${view}|${path}`;
  // a commit is small: open its files; the whole branch starts folded
  const isOpen = (path: string) => open[key(path)] ?? view !== '';
  const allOpen = files.length > 0 && files.every((f) => isOpen(f.path));
  const expandAll = () => setOpen((o) => ({ ...o, ...Object.fromEntries(files.map((f) => [key(f.path), !allOpen])) }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[' || e.key === ']') step(e.key === '[' ? -1 : 1);
      else if (e.key === 'e') expandAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const picked = [...r.commits, ...r.baseCommits].find((c) => c.sha === view);
  const onBase = !!picked && r.baseCommits.includes(picked);
  const add = files.reduce((s, f) => s + f.a, 0);
  const del = files.reduce((s, f) => s + f.d, 0);
  const commitRow = (c: Commit) => (
    <button key={c.sha} type="button" className="ln-cm" aria-pressed={view === c.sha} onClick={() => pick(view === c.sha ? '' : c.sha)}>
      <GitCommitHorizontal size={14} aria-hidden />
      <span className="sha">{c.sha}</span>
      <span className="sans msg">{c.subject}</span>
      <span className="who">
        {c.author} · {c.when}
      </span>
      <span className="st">
        <span className="pa">+{c.a}</span> <span className="pd">−{c.d}</span>
      </span>
    </button>
  );
  return (
    <>
      <section className="ln-sec">
        <h2>
          The branch <span className="lbl plain">what landing would bring into {r.repo.base}</span>
        </h2>
        <p className="ln-cmp">
          {r.row.branch} is {r.commits.length} commit{r.commits.length === 1 ? '' : 's'} ahead of {r.repo.base} · cut from {r.cut}
        </p>
        <div className="ln-list">{r.commits.map(commitRow)}</div>
        {r.commits.length === 0 && <p className="in-empty">Nothing to land: the branch has no commits {r.repo.base} lacks.</p>}
        <p className="lbl plain">pick a commit to see only what it changed</p>
        <code className="ws-cmd">$ git -C {r.repo.root} log --oneline {r.repo.base}..{r.row.branch}</code>
        {r.baseCommits.length > 0 && (
          <div className="ln-moved">
            <p className="sans">
              <b>
                {r.repo.base} moved {r.baseCommits.length} commit{r.baseCommits.length === 1 ? '' : 's'} since this branch was cut.
              </b>{' '}
              {r.overlap.length ? (
                <>
                  Both sides changed <code>{r.overlap.join(', ')}</code>, so landing may conflict. The dry run in the next stage tells you for sure.
                </>
              ) : (
                'No file changed on both sides.'
              )}
            </p>
            <div className="ln-list">{r.baseCommits.map(commitRow)}</div>
          </div>
        )}
      </section>

      <section className="ln-sec" id="files">
        <h2>
          Files <span className="lbl plain">{picked ? `changed in ${picked.sha}` : 'changed on the branch'}</span>
          <span className="sp" />
          <button type="button" className="ln-link" onClick={expandAll}>
            {allOpen ? 'collapse all' : 'expand all'}
          </button>
        </h2>
        <div className="ln-scope">
          {picked ? (
            <>
              <b>{picked.sha}</b>
              <span className="sans">{picked.subject}</span>
              <span className="lbl plain">
                {picked.author} · {picked.when}
              </span>
              {onBase && <span className="ln-tag">on {r.repo.base}, not in this branch</span>}
            </>
          ) : (
            <>
              <span>All changes</span>
              <span className="lbl plain">
                {r.repo.base}...{r.row.branch} · {r.commits.length} commits
              </span>
            </>
          )}
          <span className="sp" />
          <span className="lbl plain">
            {files.length} file{files.length === 1 ? '' : 's'} <span className="pa">+{add}</span> <span className="pd">−{del}</span>
          </span>
          {!onBase && (
            <span className="ln-nav">
              <button type="button" disabled={order.indexOf(view) <= 0} onClick={() => step(-1)} aria-label="Previous commit">
                ‹ [
              </button>
              <button type="button" disabled={order.indexOf(view) === order.length - 1} onClick={() => step(1)} aria-label="Next commit">
                ] ›
              </button>
            </span>
          )}
          {picked && (
            <button type="button" className="ln-link" onClick={() => setView('')}>
              all changes
            </button>
          )}
        </div>
        {diff.isError && <p className="in-empty">{diff.error.message}</p>}
        {files.map((f) => {
          const cut = f.path.lastIndexOf('/') + 1;
          const o = isOpen(f.path);
          return (
            <div key={f.path} className={`ln-file ${o ? 'open' : ''}`}>
              <button type="button" className="ln-fh" aria-expanded={o} onClick={() => setOpen((s) => ({ ...s, [key(f.path)]: !o }))}>
                <span className="chev">›</span>
                <span className="p">
                  {f.path.slice(0, cut)}
                  <b>{f.path.slice(cut)}</b>
                </span>
                {!picked && r.overlap.includes(f.path) && <span className="ln-tag">also changed on {r.repo.base}</span>}
                <span className="pa">+{f.a}</span>
                <span className="pd">−{f.d}</span>
              </button>
              {o && (
                <Diff
                  patch={f.patch}
                  binary={f.binary}
                  command={picked ? `$ git -C ${r.repo.root} show ${picked.sha} -- ${f.path}` : `$ git -C ${r.repo.root} diff ${r.repo.base}...${r.row.branch} -- ${f.path}`}
                />
              )}
            </div>
          );
        })}
        <code className="ws-cmd">$ {picked ? `git -C ${r.repo.root} show --stat ${picked.sha}` : `git -C ${r.repo.root} diff --stat ${r.repo.base}...${r.row.branch}`}</code>
      </section>

      {r.row.lastRun && (
        <section className="ln-sec">
          <h2>
            The run <span className="lbl plain">its check and review are in the run&apos;s log</span>
          </h2>
          <p>
            <Link href={`/runs?run=${encodeURIComponent(r.row.lastRun.name)}`}>{r.row.lastRun.flow}</Link> · {r.row.lastRun.status} · runs/{r.row.lastRun.name}
          </p>
        </section>
      )}

      <div className="ln-ask">
        <div className="ln-ask-h">
          <AlertTriangle size={13} aria-hidden /> wants you · Does this branch do what the task asked?
        </div>
        <div className="ln-ask-b">
          <p className="sans">Read the commits and the diff above. Landing is a host action you trigger: the flow cannot merge, push, or touch {r.repo.base} on its own.</p>
          <div className="ws-acts">
            <button type="button" className="act primary" disabled={!r.commits.length} onClick={onLand}>
              <GitMerge size={13} aria-hidden />
              Looks right: go to Land
            </button>
            <button type="button" className="act" onClick={onSkip}>
              <Trash2 size={13} aria-hidden />
              Clean up without landing
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── 2 Land ──────────────────────────────────────────────── */

function LandStage({ r, folder, onLanded, onUpdated }: { r: Review; folder: string; onLanded: (head: string, s: Strategy, note?: string) => void; onUpdated: () => void }) {
  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [message, setMessage] = useState(() =>
    [`Land ${r.row.id}`, '', ...[...r.commits].reverse().map((c) => `- ${c.subject}`), '', `FlowBoard-Task: ${r.row.id}`].join('\n'),
  );
  const [dry, setDry] = useState<DryRun | undefined>();
  const [busy, setBusy] = useState<'' | 'dry' | 'update' | 'land'>('');
  const [result, setResult] = useState<ActResult | undefined>();
  const s = STRATS[strategy];
  const run = async () => {
    setBusy('dry');
    setResult(undefined);
    setDry(await dryRun(folder, r.row.id));
    setBusy('');
  };
  const update = async () => {
    setBusy('update');
    const res = await updateFromBase(folder, r.row.id);
    setResult(res);
    setBusy('');
    if (res.ok) {
      onUpdated();
      await run();
    }
  };
  const land = async () => {
    setBusy('land');
    const res = await landBranch(folder, r.row.id, strategy, message);
    setBusy('');
    if (res.ok) onLanded(res.head ?? '', strategy, res.note);
    else setResult(res);
  };
  const blocked = dry?.checks?.filter((c) => !c.ok) ?? [];
  const clean = dry?.ok && blocked.length === 0;
  return (
    <>
      <section className="ln-sec">
        <h2>How it lands</h2>
        <div className="ln-strats" role="radiogroup">
          {(Object.keys(STRATS) as Strategy[]).map((k) => (
            <label key={k} className="ln-strat" aria-checked={strategy === k}>
              <input type="radio" name="strategy" checked={strategy === k} onChange={() => setStrategy(k)} />
              <b>{STRATS[k].name}</b>
              <span className="sans">{STRATS[k].says(r.repo.base)}</span>
            </label>
          ))}
        </div>
        <code className="ws-cmd">$ {s.cmd(r.repo.root, r.repo.base, r.row.branch, r.row.path)}</code>
      </section>
      {strategy !== 'ff' && (
        <section className="ln-sec">
          <h2>
            Commit message <span className="lbl plain">for the commit on {r.repo.base}</span>
          </h2>
          <textarea className="ln-msg sans" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
        </section>
      )}
      <section className="ln-sec">
        <h2>
          Dry run <span className="lbl plain">a merge in memory: no checkout is touched</span>
        </h2>
        <div className="ws-acts">
          <button type="button" className="act" disabled={!!busy} onClick={() => void run()}>
            {busy === 'dry' ? 'Merging in memory…' : dry ? 'Run it again' : 'Dry run'}
          </button>
        </div>
        <code className="ws-cmd">
          $ git -C {r.repo.root} merge-tree --write-tree --name-only {r.repo.base} {r.row.branch}
        </code>
        {dry?.checks && (
          <ul className="ln-checks">
            {dry.checks.map((c) => (
              <li key={c.text} className={c.ok ? '' : 'bad'}>
                {c.ok ? <Check size={12} aria-hidden /> : <AlertTriangle size={12} aria-hidden />} {c.text}
              </li>
            ))}
          </ul>
        )}
        {dry && !dry.ok && (
          <div className="ws-problem">
            <b>
              {dry.error}
              {dry.conflicts?.length ? ` in ${dry.conflicts.join(', ')}` : ''}
            </b>
            {dry.conflicts?.length ? (
              <div className="ws-acts">
                <button type="button" className="act" disabled={!!busy} onClick={() => void update()}>
                  {busy === 'update' ? 'Replaying…' : `Update the branch from ${r.repo.base}`}
                </button>
                <Link className="act" href={`/runs?${new URLSearchParams({ new: r.row.lastRun?.flow ?? '1', workspace: r.row.id, folder })}`}>
                  Send back to the flow
                </Link>
                <code className="ws-cmd">$ git -C {r.row.path} rebase {r.repo.base}</code>
              </div>
            ) : null}
          </div>
        )}
        {result && !result.ok && (
          <div className="ws-problem">
            <b>{result.error}</b>
            {result.conflicts?.length ? <span>conflicts in {result.conflicts.join(', ')}; resolve them in the workspace, or send the task back to the flow</span> : null}
          </div>
        )}
        {result?.ok && <p className="ln-ok">The branch now sits on {r.repo.base}&apos;s tip ({result.head}).</p>}
      </section>
      <div className="ln-ask">
        <div className="ln-ask-h">
          <AlertTriangle size={13} aria-hidden /> wants you · Land {r.commits.length} commit{r.commits.length === 1 ? '' : 's'} into {r.repo.base}?
        </div>
        <div className="ln-ask-b">
          <p className="sans">
            {clean
              ? 'The dry run is clean and every check holds.'
              : !dry
                ? 'Run the dry run first; Land waits until it is clean.'
                : blocked.length
                  ? 'A check above does not hold; Land waits until every one does.'
                  : 'The dry run found a conflict. Update the branch, or send the task back to the flow, then run it again.'}
          </p>
          <div className="ws-acts">
            <button type="button" className="act primary" disabled={!clean || !!busy} onClick={() => void land()}>
              <GitMerge size={13} aria-hidden />
              {busy === 'land' ? 'Landing…' : `Land into ${r.repo.base}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── 3 Clean up ──────────────────────────────────────────── */

function CleanStage({ r, folder, landed }: { r: Review; folder: string; landed?: { head: string; strategy: Strategy; note?: string } }) {
  const [res, setRes] = useState<ActResult | undefined>();
  const [busy, setBusy] = useState(false);
  // landed here, or already in the base before this page opened (nothing left to land)
  const merged = landed ? landed.strategy !== 'squash' : r.commits.length === 0;
  const go = async (force: boolean) => {
    setBusy(true);
    setRes(await cleanUp(folder, r.row.id, force));
    setBusy(false);
  };
  const refusedDirty = res && !res.ok && /uncommitted|modified or untracked/.test(res.error);
  return (
    <>
      {landed && (
        <section className="ln-sec">
          <p className="ln-ok">
            <Check size={13} aria-hidden /> Landed: {r.repo.base} is now at {landed.head}. {landed.note}
          </p>
        </section>
      )}
      <section className="ln-sec">
        <h2>What clean up does</h2>
        <div className="ln-ledger">
          <div>
            <span className="lbl">goes</span>
            <p>
              <b>{r.row.path}</b> the folder, with the artifacts in its .flowboard/ (brief, plan, review); they were never committed
            </p>
            <p>
              <b>{r.row.branch}</b>{' '}
              {merged ? 'the branch: it is merged now' : `only if merged; ${landed ? 'a squash is not a merge to git, so it stays' : `its ${r.commits.length} commit(s) are not, so it stays`}`}
            </p>
          </div>
          <div>
            <span className="lbl">stays</span>
            <p>the run logs in runs/</p>
            {landed && <p>the commits on {r.repo.base}</p>}
          </div>
        </div>
      </section>
      {!res?.ok && (
        <div className="ln-ask">
          <div className="ln-ask-h">
            <AlertTriangle size={13} aria-hidden /> wants you · Remove the workspace of {r.row.id}?
          </div>
          <div className="ln-ask-b">
            {res && !res.ok && <div className="ws-problem"><b>{res.error}</b></div>}
            <div className="ws-acts">
              {refusedDirty ? (
                <button type="button" className="act danger" disabled={busy} onClick={() => void go(true)}>
                  <Trash2 size={13} aria-hidden />
                  Throw the uncommitted files away and clean up
                </button>
              ) : (
                <button type="button" className="act primary" disabled={busy} onClick={() => void go(false)}>
                  <Trash2 size={13} aria-hidden />
                  Clean up
                </button>
              )}
              <Link className="act" href={`/workspaces?folder=${encodeURIComponent(folder)}`}>
                Keep the workspace
              </Link>
            </div>
            <code className="ws-cmd">$ {cli.clean(folder, r.row.id, !!refusedDirty)}</code>
          </div>
        </div>
      )}
      {res?.ok && (
        <section className="ln-sec">
          <p className="ln-ok">
            <Check size={13} aria-hidden /> Removed the workspace of {r.row.id}.
          </p>
          {res.branchKept && (
            <p className="ws-problem">
              <b>
                Kept branch {res.branchKept}: it has commits not merged into {r.repo.base}. The work survives there; a run with task id {r.row.id} picks it up again. Delete it
                with git branch -D {res.branchKept}
              </b>
            </p>
          )}
          <div className="ws-acts">
            <Link className="act" href={`/workspaces?folder=${encodeURIComponent(folder)}`}>
              Back to workspaces
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
