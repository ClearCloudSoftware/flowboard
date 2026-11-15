'use client';
/**
 * OpenCode's two model sources: OpenRouter's key (Connections → OpenRouter), Ollama on this machine (Connections →
 * Ollama), and the models a step may run on (Agents → OpenCode models). All load /api/models; approving a model saves
 * the app's `opencodeModels`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { KeyTest } from '../../packages/cli/src/openrouter.ts';
import { type ApprovedModel, type CatalogueModel, CONTEXT_FLOOR, FREE_WARNING, isLocal, type OllamaModel } from '../../packages/cli/src/settings.ts';
import { modelsQuery, type ModelsView, refreshModels, removeOpenRouterKey, saveOpenRouterKey, testOpenRouterKey, updateAppSettings } from '../projects/api.ts';
import { ErrorLine, Field, Head } from './settings.tsx';

const note = 'm-0 font-sans text-xs text-[var(--ink-2)]';
const warn = 'm-0 flex items-start gap-2 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 font-sans text-xs text-wait';
const usd = (n: number) => `$${Number(n.toFixed(4))}`;
const money = (n: number | null) => (n === null ? 'no limit' : `$${n.toFixed(2)}`);

// --- Connections → OpenRouter ------------------------------------------------------------------------------------

function KeyLine({ view }: { view: ModelsView }) {
  const { source, last4 } = view.key;
  if (source === null) return <p className={warn}>No key. OpenCode&rsquo;s steps fall back to the credentials OpenCode stores itself (opencode auth login).</p>;
  return (
    <p className="m-0 font-sans text-sm">
      {source === 'env' ? 'From OPENROUTER_API_KEY in FlowBoard’s environment, which wins over a saved key' : 'Saved'} · ends <code className="font-mono">…{last4}</code>
    </p>
  );
}

function Tested({ t }: { t: KeyTest }) {
  if (!t.ok) return <p className={warn}>{t.error}</p>;
  return (
    <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">name</dt>
      <dd className="m-0 font-mono">{t.label || '—'}</dd>
      <dt className="text-muted-foreground">credit limit</dt>
      <dd className="m-0 font-mono">{money(t.limitUsd)}</dd>
      <dt className="text-muted-foreground">spent</dt>
      <dd className="m-0 font-mono">{money(t.usageUsd)}</dd>
      {t.remainingUsd !== null && (
        <>
          <dt className="text-muted-foreground">left</dt>
          <dd className="m-0 font-mono">{money(t.remainingUsd)}</dd>
        </>
      )}
    </dl>
  );
}

export function OpenRouterPage() {
  const queryClient = useQueryClient();
  const view = useQuery(modelsQuery);
  const [key, setKey] = useState('');
  const done = () => queryClient.invalidateQueries({ queryKey: ['models'] });
  const save = useMutation({ mutationFn: () => saveOpenRouterKey(key), onSuccess: () => (setKey(''), test.reset(), done()) });
  const remove = useMutation({ mutationFn: removeOpenRouterKey, onSuccess: () => (test.reset(), done()) });
  const test = useMutation({ mutationFn: testOpenRouterKey });
  return (
    <>
      <Head title="OpenRouter">The key OpenCode&rsquo;s steps run on, for models named openrouter/…. Which models they may use is under Agents → OpenCode models.</Head>
      {view.isPending && <p className="m-0 text-muted-foreground">Loading…</p>}
      <ErrorLine error={view.error} />
      {view.data && (
        <>
          <Field title="API key" htmlFor="or-key" text={<>Saved in <code>secrets.json</code> in FlowBoard&rsquo;s data folder, apart from its settings, so no page ever reads it back. Only you can read the file on macOS and Linux; on Windows, whoever can read the data folder can.</>}>
            <KeyLine view={view.data} />
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Input id="or-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={view.data.key.source === 'saved' ? 'a new key, to replace it' : 'sk-or-v1-…'} autoComplete="off" spellCheck={false} className="h-8 max-w-sm font-mono text-[13px]" />
              <Button size="sm" type="submit" disabled={!key.trim() || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {view.data.key.source !== null && (
                <Button size="sm" type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending ? 'Testing…' : 'Test'}
                </Button>
              )}
              {view.data.key.source === 'saved' && (
                <Button size="sm" type="button" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  Remove
                </Button>
              )}
            </form>
            <ErrorLine error={save.error ?? remove.error ?? test.error} />
            {test.data && <Tested t={test.data} />}
          </Field>
          <p className={note}>
            For a hard ceiling outside FlowBoard, give this key a credit limit on{' '}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="underline">
              openrouter.ai
            </a>
            .
          </p>
        </>
      )}
    </>
  );
}

// --- Connections → Ollama ----------------------------------------------------------------------------------------

const WINDOW_RULE = (
  <>
    The window a model runs with is its <code>num_ctx</code>, else <code>OLLAMA_CONTEXT_LENGTH</code> in FlowBoard&rsquo;s environment, else what Ollama reports while the model is loaded. With none of those, Ollama picks a default from this machine&rsquo;s memory, which it does not report: such a model shows &ldquo;default&rdquo; and is not warned of. Below {CONTEXT_FLOOR.toLocaleString('en-US')} tokens, a step is warned that an agent can outgrow it.
  </>
);

export function OllamaPage() {
  const view = useQuery(modelsQuery);
  const o = view.data?.ollama;
  return (
    <>
      <Head title="Ollama">Models on this machine for OpenCode&rsquo;s steps, named ollama/…. Which of them steps may use is under Agents → OpenCode models.</Head>
      {view.isPending && <p className="m-0 text-muted-foreground">Loading…</p>}
      <ErrorLine error={view.error} />
      {o && (
        <>
          <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">address</dt>
            <dd className="m-0 font-mono">{o.address || '—'}</dd>
            <dt className="text-muted-foreground">status</dt>
            <dd className="m-0 font-mono">{o.error ? 'not answering' : `answering · Ollama ${o.version ?? '?'}`}</dd>
            <dt className="text-muted-foreground">models</dt>
            <dd className="m-0 font-mono">{o.models ? `${o.models.length} local, tool-capable` : '—'}</dd>
          </dl>
          {o.error && <p className={warn}>{o.error}</p>}
          <p className={note}>
            The address is <code>OLLAMA_HOST</code> as the ollama CLI reads it, else 127.0.0.1:11434. FlowBoard uses only Ollama on this machine: an address elsewhere is refused. Sandboxed steps reach it as host.docker.internal, which Docker Desktop forwards to this machine, so Ollama need not listen wider.
          </p>
          <p className={note}>Only local models that take tools are listed: embedding models, and cloud models, which run on ollama.com, are left out. Local models cost nothing, and their prompts stay on this machine.</p>
          <p className={note}>{WINDOW_RULE}</p>
        </>
      )}
    </>
  );
}

// --- Agents → OpenCode models -----------------------------------------------------------------------------------

const approvalOf = (m: CatalogueModel | OllamaModel): ApprovedModel => ({ id: m.id, free: m.free, price: m.price, approvedAt: new Date().toISOString(), ...('local' in m && { local: true as const }) });
type Show = 'all' | 'free' | 'approved';
type Source = 'openrouter' | 'ollama';
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
const k = (n: number | null) => (n ? `${Math.round(n / 1024)}k` : '');

export function OpencodeModelsPage() {
  const queryClient = useQueryClient();
  const view = useQuery(modelsQuery);
  const [source, setSource] = useState<Source>('openrouter');
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [asked, setAsked] = useState<CatalogueModel | null>(null); // a free model waiting on the privacy warning
  const set = useMutation({
    mutationFn: (models: ApprovedModel[]) => updateAppSettings({ opencodeModels: models }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['models'] }), queryClient.invalidateQueries({ queryKey: ['settings'] })]),
  });
  const refresh = useMutation({ mutationFn: refreshModels, onSuccess: (v) => queryClient.setQueryData(['models'], v) });
  if (view.isPending) return <p className="m-0 text-muted-foreground">Loading…</p>;
  if (!view.data) return <ErrorLine error={view.error} />;
  const { catalogue, approved, ollama } = view.data;
  const kept: ApprovedModel[] = approved.map(({ id, free, price, approvedAt, local }) => ({ id, free, price, approvedAt, ...(local && { local }) }));
  const byId = new Map(approved.map((m) => [m.id, m]));
  const approve = (m: CatalogueModel | OllamaModel) => set.mutate([...kept.filter((a) => a.id !== m.id), approvalOf(m)]);
  const withdraw = (id: string) => set.mutate(kept.filter((a) => a.id !== id));
  // A local model is free and private: no privacy question.
  const tick = (m: CatalogueModel | OllamaModel, on: boolean) => (!on ? withdraw(m.id) : m.free && !isLocal(m.id) ? setAsked(m) : approve(m));
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = (catalogue?.models ?? []).filter(
    (m) => (show === 'all' || (show === 'free' ? m.free : byId.has(m.id))) && words.every((w) => `${m.id} ${m.name}`.toLowerCase().includes(w)),
  );
  // Approved models their source no longer lists have no row below; they are shown here, to be removed. A source
  // with no list (never fetched, or Ollama not answering) cannot say.
  const listOf = (id: string) => (isLocal(id) ? ollama.models : catalogue?.models);
  const orphans = approved.filter((a) => listOf(a.id) && !listOf(a.id)!.some((m) => m.id === a.id));
  const troubled = approved.filter((a) => a.problem && !orphans.includes(a));
  const count = (s: Source) => approved.filter((a) => isLocal(a.id) === (s === 'ollama')).length;

  return (
    <>
      <Head title="OpenCode models">
        The only models an OpenCode step may run on, for every project; free ones need ticking too. A flow step picks from these, and a run on any other is refused.
      </Head>
      <ErrorLine error={view.error ?? set.error ?? refresh.error} />
      {[...troubled, ...orphans].map((a) => (
        <div key={a.id} className={`${warn} items-center justify-between`}>
          <span className="flex items-start gap-2">
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
            {a.problem}
          </span>
          <span className="flex gap-2">
            {!orphans.includes(a) && !isLocal(a.id) && (
              <Button size="sm" variant="outline" className="h-6" onClick={() => catalogue && approve(catalogue.models.find((m) => m.id === a.id)!)}>
                Approve again
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6" onClick={() => withdraw(a.id)}>
              Remove
            </Button>
          </span>
        </div>
      ))}
      <div role="tablist" aria-label="Source" className="flex border-b border-border">
        {(['openrouter', 'ollama'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => setSource(s)} className={`-mb-px border-b-2 px-3 py-1.5 font-sans text-sm ${source === s ? 'border-foreground text-foreground' : 'border-transparent text-[var(--ink-2)] hover:text-foreground'}`}>
            {s === 'openrouter' ? 'OpenRouter' : 'Ollama'} <span className="text-xs text-muted-foreground">({count(s)} approved)</span>
          </button>
        ))}
      </div>

      {source === 'openrouter' ? (
        <>
          {view.data.error && <p className={warn}>{view.data.error}</p>}
          {view.data.key.source === null && (
            <p className={warn}>
              No OpenRouter key saved; runs use OpenCode&rsquo;s own login.{' '}
              <Link href="/settings/connections/openrouter" className="underline">
                Save one
              </Link>
              .
            </p>
          )}
          <p className={note}>
            Free models cost no money, but their providers may keep your prompts and train on them, and the prompts include the project&rsquo;s code. If OpenRouter refuses a free model over your data policy, allow such providers in your OpenRouter privacy settings.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter: deepseek, free, gemini…" aria-label="Filter models" spellCheck={false} autoComplete="off" className="h-8 max-w-xs font-mono text-[13px]" />
            <div role="radiogroup" aria-label="Show" className="flex border border-border">
              {(['all', 'free', 'approved'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={show === s} onClick={() => setShow(s)} className={`px-2.5 py-1 font-sans text-xs ${show === s ? 'bg-foreground text-background' : 'text-[var(--ink-2)] hover:bg-secondary'}`}>
                  {s === 'approved' ? `approved (${count('openrouter')})` : s}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">{catalogue ? `${catalogue.models.length} models, listed ${new Date(catalogue.fetchedAt).toLocaleString()}` : 'no list yet'}</span>
            <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              <RefreshCw aria-hidden className="size-3.5" strokeWidth={1.75} />
              {refresh.isPending ? 'Fetching…' : 'Fetch again'}
            </Button>
          </div>
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-10 px-3 py-2 font-normal">
                    <span className="sr-only">approved</span>
                  </th>
                  <th className="px-3 py-2 font-normal">model</th>
                  <th className="px-3 py-2 text-right font-normal">input / M</th>
                  <th className="px-3 py-2 text-right font-normal">output / M</th>
                  <th className="px-3 py-2 text-right font-normal">context</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const a = byId.get(m.id);
                  return (
                    <tr key={m.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">
                        <input type="checkbox" aria-label={`Approve ${m.id}`} checked={!!a} disabled={set.isPending} onChange={(e) => tick(m, e.target.checked)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <code className="font-mono text-[12px]">{m.id}</code>
                        {m.free && <span className="ml-2 border border-wait px-1 text-[10px] text-wait uppercase">free</span>}
                        {a?.problem && <span className="ml-2 text-[11px] text-fail">{a.problem.includes('costs more') ? 'price rose' : 'refused'}</span>}
                        <div className="text-[11px] text-muted-foreground">{m.name}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{m.free ? '—' : usd(m.price.in)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{m.free ? '—' : usd(m.price.out)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{m.context ? `${Math.round(m.context / 1000)}k` : ''}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      {catalogue ? 'No model matches.' : 'OpenRouter’s list has not been fetched yet; fetch it again above.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {ollama.error && (
            <p className={warn}>
              {ollama.error}{' '}
              <Link href="/settings/connections/ollama" className="underline">
                Ollama
              </Link>
            </p>
          )}
          <p className={note}>Models in Ollama on this machine that take tools. They cost nothing, and their prompts stay here. {WINDOW_RULE}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">{ollama.models ? `${ollama.models.length} models at ${ollama.address}` : `nothing listed from ${ollama.address || 'Ollama'}`}</span>
            <Button size="sm" variant="outline" disabled={view.isFetching} onClick={() => view.refetch()}>
              <RefreshCw aria-hidden className="size-3.5" strokeWidth={1.75} />
              {view.isFetching ? 'Asking…' : 'Ask again'}
            </Button>
          </div>
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-10 px-3 py-2 font-normal">
                    <span className="sr-only">approved</span>
                  </th>
                  <th className="px-3 py-2 font-normal">model</th>
                  <th className="px-3 py-2 text-right font-normal">size</th>
                  <th className="px-3 py-2 text-right font-normal">window</th>
                  <th className="px-3 py-2 text-right font-normal">max</th>
                </tr>
              </thead>
              <tbody>
                {(ollama.models ?? []).map((m) => {
                  const a = byId.get(m.id);
                  const small = m.context !== null && m.context < CONTEXT_FLOOR;
                  return (
                    <tr key={m.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">
                        <input type="checkbox" aria-label={`Approve ${m.id}`} checked={!!a} disabled={set.isPending} onChange={(e) => tick(m, e.target.checked)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <code className="font-mono text-[12px]">{m.id}</code>
                        <span className="ml-2 border border-border px-1 text-[10px] text-muted-foreground uppercase">local</span>
                        {a?.problem && <span className="ml-2 text-[11px] text-fail">refused</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{gb(m.size)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${small ? 'text-wait' : ''}`} title={m.contextFrom ? `from ${m.contextFrom}` : 'Ollama’s default, which it does not report'}>
                        <span className="inline-flex items-center gap-1">
                          {small && <TriangleAlert aria-label="small window" className="size-3.5" strokeWidth={1.75} />}
                          {m.context ? k(m.context) : 'default'}
                        </span>
                        <div className="text-[10px] text-muted-foreground">{m.contextFrom ?? 'unknown'}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{k(m.maxContext)}</td>
                    </tr>
                  );
                })}
                {!ollama.models?.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      {ollama.models ? 'No local model takes tools; pull one with ollama pull.' : 'Ollama did not answer; start it, then ask again.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AlertDialog open={asked !== null} onOpenChange={(o) => !o && setAsked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans">Approve a free model?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono">{asked?.id}</code> is {FREE_WARNING}. Every step that runs on it sends that code to its provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don&rsquo;t approve</AlertDialogCancel>
            <AlertDialogAction onClick={() => asked && approve(asked)}>Approve it anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- the model picker the settings pages share -----------------------------------------------------------------

const NONE = '-'; // Radix keeps '' for "nothing picked"

/**
 * OpenCode's model, picked from the approved models only, as the flow designer picks it. `none` names an empty
 * choice where the field may be empty; a saved value the list lacks stays shown, marked, until it is changed.
 */
export function OpencodeModelSelect({ value, onChange, none, className }: { value: string; onChange: (v: string) => void; none?: string; className?: string }) {
  const q = useQuery(modelsQuery);
  const approved = q.data?.approved ?? [];
  const picked = approved.find((m) => m.id === value);
  const line = 'text-[11px] not-italic';
  return (
    <>
      <Select value={value === '' ? (none ? NONE : '') : value} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        {/* min-w-0 and truncate: a long model id stays in its column instead of running over the next field */}
        <SelectTrigger className={`${className ?? ''} min-w-0`} aria-invalid={value !== '' && !picked ? true : undefined}>
          <span className="min-w-0 truncate">
            <SelectValue placeholder="pick an approved model" />
          </span>
        </SelectTrigger>
        <SelectContent className="font-mono">
          {none && <SelectItem value={NONE}>{none}</SelectItem>}
          {value !== '' && !picked && <SelectItem value={value}>{value} (not approved)</SelectItem>}
          {approved.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.id}
              {m.local ? ' · local' : m.free ? ' · free' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {q.data && approved.length === 0 && (
        <em className={`${line} text-wait`}>
          No models approved yet:{' '}
          <Link href="/settings/agents/models" className="underline">
            approve some
          </Link>
        </em>
      )}
      {value !== '' && !picked && q.data && <em className={`${line} text-fail`}>not an approved model; pick one</em>}
      {picked?.problem && <em className={`${line} text-fail`}>{picked.problem}</em>}
      {picked?.free && !picked.local && <em className={`${line} text-wait`}>free: its provider may keep your prompts, which include the project&rsquo;s code</em>}
      {picked?.local && picked.warning && <em className={`${line} text-wait`}>{picked.warning}</em>}
    </>
  );
}
