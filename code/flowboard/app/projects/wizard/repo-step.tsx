'use client';
/**
 * The wizard's third step: the GitHub account the installed `gh` is logged in as, its owners, and their repositories.
 * When `gh` can't be used, the step says which command fixes it instead.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GhFix } from '../../settings/github.tsx';
import { type GhRepo, type GitHubView, reposQuery, type ReposView, switchAccount } from '../api.ts';

/** `2026-11-10T…` -> `2 d ago`, the way the mockup counts. */
export function ago(iso: string, now = Date.now()) {
  const h = (now - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} d ago`;
  if (d < 60) return `${Math.floor(d / 7)} w ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} y ago`;
}

const box = 'grid max-w-[520px] gap-2.5 border border-input p-[18px] font-sans';
const hint = 'text-[11px] text-muted-foreground';

/** `gh` missing, signed out or refused: what to run, and a way to look again. */
export function ConnectBox({ gh, onCheck, checking }: { gh: GitHubView; onCheck: () => void; checking: boolean }) {
  const rejected = gh.status.state === 'rejected';
  return (
    <div className={`${box} ${rejected ? 'border-[var(--wait-edge)] border-l-[3px] border-l-wait' : ''}`}>
      <p className="m-0">
        <GhFix status={gh.status} />
      </p>
      {rejected && <p className="m-0 text-muted-foreground">Nothing is lost: what you picked so far stays. Your other projects can&apos;t fetch or push until the CLI is signed in again.</p>}
      {!rejected && (
        <ul className="m-0 pl-[18px] text-[var(--ink-2)]">
          <li>FlowBoard clones and fetches the repositories you pick with that login</li>
          <li>it pushes only the branches it makes, when you say so</li>
          <li>it keeps no token of its own, and agents never see one</li>
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" onClick={onCheck} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </Button>
        <span className={hint}>after running the command in a terminal</span>
      </div>
    </div>
  );
}

/** An organization that restricts OAuth apps: why its repositories are hidden, and how to get them. */
function Restricted({ owner, url, onCheck, checking }: { owner: string; url: string; onCheck: () => void; checking: boolean }) {
  return (
    <div className={box}>
      <p className="m-0">
        <b>{owner}</b> has not let the GitHub CLI in, so GitHub hides its repositories from FlowBoard. An owner of {owner} approves it under the organization&apos;s Settings → Third-party access.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Request access
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onCheck} disabled={checking}>
          {checking ? 'Asking GitHub…' : 'Check again'}
        </Button>
        <span className={hint}>GitHub asks {owner}&apos;s owners; pick a repository from another owner meanwhile</span>
      </div>
    </div>
  );
}

export function RepoStep({ gh, owner, onOwner, picked, onPick }: { gh: GitHubView; owner: string; onOwner: (o: string) => void; picked?: GhRepo; onPick: (r: GhRepo) => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [help, setHelp] = useState(false);
  const [another, setAnother] = useState(false);
  const repos = useQuery({ ...reposQuery(owner), enabled: !!owner });
  const sw = useMutation({ mutationFn: switchAccount, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['github'] }) });
  if (gh.status.state !== 'connected') return null;
  const login = gh.status.login;
  const owners = gh.owners ?? [login];
  const restricted = (o: string) => {
    const r = queryClient.getQueryData<ReposView>(reposQuery(o).queryKey);
    return !!r && !r.ok && r.reason === 'restricted';
  };
  const data = repos.data;
  const needle = q.trim().toLowerCase();
  const list = data?.ok ? data.repos.filter((r) => !needle || `${r.name} ${r.description}`.toLowerCase().includes(needle)) : [];

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Check className="size-3.5 text-run" aria-hidden />
        <span>
          connected as <b>{login}</b>
        </span>
        <button type="button" className="text-[11px] text-muted-foreground underline underline-offset-[3px] hover:text-foreground" onClick={() => setAnother(!another)} aria-expanded={another}>
          use another account
        </button>
        <span className="flex-1" />
        <div role="group" aria-label="Owner" className="flex flex-wrap border border-input">
          {owners.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={owner === o}
              onClick={() => {
                onOwner(o);
                setQ('');
              }}
              className="border-r border-input px-2.5 py-0.5 text-xs last:border-r-0 aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {o}
              {restricted(o) && <small className="ml-1.5 text-[10px] text-wait">no access</small>}
            </button>
          ))}
        </div>
      </div>
      {another && (
        <p className="mt-0 mb-2 font-sans text-xs text-muted-foreground">
          {gh.status.accounts.length > 1 ? (
            <>
              The GitHub CLI also holds{' '}
              {gh.status.accounts
                .filter((a) => a !== login)
                .map((a) => (
                  <Button key={a} size="xs" variant="outline" className="mx-0.5" disabled={sw.isPending} onClick={() => sw.mutate(a)}>
                    {a}
                  </Button>
                ))}
              . For one it doesn&apos;t, run <code className="bg-secondary px-1">gh auth login</code> in a terminal.
            </>
          ) : (
            <>
              FlowBoard uses whoever the GitHub CLI is logged in as. Run <code className="bg-secondary px-1">gh auth login</code> in a terminal to add another account, then{' '}
              <button type="button" className="underline underline-offset-[3px]" onClick={() => void queryClient.invalidateQueries({ queryKey: ['github'] })}>
                reload the list
              </button>
              .
            </>
          )}
        </p>
      )}
      <p className="mt-0 mb-2 font-sans text-xs text-muted-foreground">
        <button type="button" className="underline underline-offset-[3px] hover:text-foreground" aria-expanded={help} onClick={() => setHelp(!help)}>
          Don&apos;t see an organization?
        </button>
        {help && (
          <>
            {' '}
            An organization shows here when your account is a member of it. If it is listed with <i>no access</i>, it restricts apps like the GitHub CLI: request access from it. If it isn&apos;t listed at all, ask to be added to it on GitHub, then{' '}
            <button type="button" className="underline underline-offset-[3px]" onClick={() => void queryClient.invalidateQueries({ queryKey: ['github'] })}>
              reload the list
            </button>
            .
          </>
        )}
      </p>
      {repos.isPending && <p className="py-6 text-center text-muted-foreground">Asking GitHub for {owner}&apos;s repositories…</p>}
      {repos.isError && <p className="text-fail">{repos.error.message}</p>}
      {data && !data.ok && data.reason === 'restricted' && <Restricted owner={owner} url={gh.requestAccessUrl} onCheck={() => void repos.refetch()} checking={repos.isFetching} />}
      {data && !data.ok && data.reason === 'error' && (
        <div className={box}>
          <p className="m-0 text-fail">{data.error}</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => void repos.refetch()} disabled={repos.isFetching}>
              Check again
            </Button>
          </div>
        </div>
      )}
      {data?.ok && (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${owner}'s repositories…`} aria-label="Filter repositories" autoComplete="off" className="mb-2" />
          <div role="listbox" aria-label="Repositories" className="max-h-[300px] overflow-auto border border-border">
            {list.length === 0 && <div className="p-[22px] text-center text-muted-foreground">{data.repos.length ? `No repository in ${owner} matches “${q}”.` : `${owner} has no repositories you can read.`}</div>}
            {list.map((r) => {
              const id = `${r.owner}/${r.name}`;
              const taken = data.taken[id];
              const on = picked?.owner === r.owner && picked.name === r.name;
              const empty = !r.defaultBranch;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={!!taken || empty}
                  onClick={() => onPick(r)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_70px] items-center gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 enabled:hover:bg-secondary disabled:text-muted-foreground sm:grid-cols-[minmax(0,1fr)_92px_84px] ${on ? 'bg-[var(--run-soft)] shadow-[inset_3px_0_0_var(--run)]' : ''}`}
                >
                  <span className="min-w-0">
                    <b className="font-semibold">{r.name}</b>
                    {r.private && <span className="ml-1.5 border border-input px-1 align-[1px] text-[10px] text-muted-foreground">private</span>}
                    <small className={`block truncate font-sans text-xs ${taken || empty ? 'text-wait' : 'text-[var(--ink-2)]'}`}>
                      {taken ? `already the project ${taken}` : empty ? 'empty: nothing to clone yet' : r.description || ' '}
                    </small>
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">{r.language ?? ''}</span>
                  <span className="hidden text-right text-[11px] text-muted-foreground sm:block">{ago(r.pushedAt)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
