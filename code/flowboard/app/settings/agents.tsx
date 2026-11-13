'use client';
/**
 * The Agents section: the two harnesses Agent Providers builds, Claude Code and OpenCode. Each shows what this
 * machine's CLI says about itself (`/api/agents`) and how FlowBoard should run it (the app's `agents` setting).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HarnessStatus } from '../../packages/cli/src/harnesses.ts';
import { EFFORTS, type Effort, HARNESS_SCHEMAS, HARNESSES, type Harness, type HarnessConfig } from '../../packages/cli/src/settings.ts';
import { agentsQuery, type AppView, appSettingsQuery, updateAppSettings } from '../projects/api.ts';
import { ErrorLine, Head } from './settings.tsx';

const OWN = '-'; // Radix keeps '' for "nothing picked"
const blank = (s: string) => s.trim() || null;

/** What the CLI says: installed or not, its version, and the login it would run on. */
function Status({ s }: { s: HarnessStatus | undefined }) {
  if (!s) return <p className="m-0 text-xs text-muted-foreground">Checking…</p>;
  if (!s.installed)
    return (
      <p className="m-0 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 text-xs text-wait">
        {s.error ? `${s.program} did not answer: ${s.error}` : `Not installed: no ${s.program} on this machine. Install it, or name where it is below.`}
      </p>
    );
  return (
    <dl className="m-0 grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">version</dt>
      <dd className="m-0 font-mono">{s.version}</dd>
      <dt className="text-muted-foreground">login</dt>
      <dd className={`m-0 ${s.signIn.ok ? '' : 'text-wait'}`}>{s.signIn.text}</dd>
    </dl>
  );
}

function Agent({ id, view, status }: { id: Harness; view: AppView; status: HarnessStatus | undefined }) {
  const h = HARNESSES[id];
  const queryClient = useQueryClient();
  const saved = view.app.agents[id];
  const [f, setF] = useState({ path: saved.path ?? '', model: saved.model ?? '', effort: saved.effort });
  const cfg: HarnessConfig = { path: blank(f.path), model: blank(f.model), effort: f.effort };
  const errors = Object.fromEntries((HARNESS_SCHEMAS[id].safeParse(cfg).error?.issues ?? []).map((i) => [i.path[0], i.message]));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const save = useMutation({
    mutationFn: () => updateAppSettings({ agents: { ...view.app.agents, [id]: cfg } }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['settings'] }), queryClient.invalidateQueries({ queryKey: ['agents'] })]),
  });
  const field = (k: 'path' | 'model', label: string, placeholder: string) => (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={placeholder} spellCheck={false} autoComplete="off" aria-invalid={errors[k] ? true : undefined} className="h-8 font-mono text-[13px] text-foreground" />
      {errors[k] && <em className="text-[11px] text-fail not-italic">{errors[k]}</em>}
    </label>
  );
  return (
    <section aria-label={h.name} className="grid border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="m-0 font-sans text-sm font-semibold">{h.name}</h3>
        <code className="text-[11px] text-muted-foreground">{id}</code>
        <p className="m-0 basis-full font-sans text-xs text-[var(--ink-2)]">{h.text}</p>
      </header>
      <div className="grid gap-2 border-b border-border px-4 py-3">
        <Status s={status} />
        <p className="m-0 font-sans text-xs text-muted-foreground">{h.login}</p>
      </div>
      <div className="grid gap-3 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
          {field('path', 'program', `${h.bin}, on PATH`)}
          {field('model', 'default model', id === 'opencode' ? 'none: each step names one' : 'the CLI’s own')}
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            default effort
            <Select value={f.effort ?? OWN} onValueChange={(v) => setF({ ...f, effort: v === OWN ? null : (v as Effort) })}>
              <SelectTrigger className="h-8 w-full font-mono text-[13px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                <SelectItem value={OWN}>the model’s own</SelectItem>
                {EFFORTS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <p className="m-0 font-sans text-xs text-muted-foreground">Model: {h.model}. A flow step that names its own model and effort keeps them.</p>
        <ErrorLine error={save.error} />
        <div>
          <Button size="sm" disabled={!dirty || Object.keys(errors).length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AgentsPage() {
  const view = useQuery(appSettingsQuery);
  const agents = useQuery(agentsQuery);
  return (
    <>
      <Head title="Agents">The agent CLIs FlowBoard drives. Each runs on its own login on this machine; FlowBoard stores no key for either.</Head>
      {view.isPending && <p className="m-0 text-muted-foreground">Loading…</p>}
      <ErrorLine error={view.error ?? agents.error} />
      {view.data && (
        <>
          {(Object.keys(HARNESSES) as Harness[]).map((id) => (
            <Agent key={`${id}:${JSON.stringify(view.data.app.agents[id])}`} id={id} view={view.data} status={agents.data?.[id]} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={agents.isFetching} onClick={() => void agents.refetch()}>
              {agents.isFetching ? 'Checking…' : 'Check again'}
            </Button>
            <span className="text-xs text-muted-foreground">Saved here; runs do not read these yet. Each flow step still names its adapter and model.</span>
          </div>
        </>
      )}
    </>
  );
}
