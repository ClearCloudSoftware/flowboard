'use client';
/**
 * The settings pages, one per setting, shared by the wizard, the project page and the app settings page. Each shows
 * what it inherits and from where, with an override switch; `mode: 'app'` is the app's own values, so no switch.
 */
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import type { SettingKey } from '../../packages/cli/src/settings.ts';
import { TRUST } from '../../packages/cli/src/settings.ts';
import {
  type Ctx,
  describe,
  type Draft,
  type Field,
  fromLabel,
  graphifyCost,
  KNOWLEDGE,
  limitsText,
  type Mode,
  note,
  ON_LIMIT,
  type PageId,
  problems,
  REBUILD,
  SETTING_PAGES,
  summary,
  toggle,
  type Values,
} from './settings-model.ts';

interface PageProps { draft: Draft; onChange: (d: Draft) => void; ctx: Ctx; mode: Mode }

/** Not acted on yet: each later phase of the projects work makes one of these real. */
const NOT_YET = 'Saved now; FlowBoard does not act on it yet.';

export const lbl = 'text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase';
const desc = 'm-0 font-sans text-xs text-muted-foreground';

export function Warn({ children }: { children: ReactNode }) {
  return <p className="m-0 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 text-xs text-wait">{children}</p>;
}

/** A row of choices, one pressed. */
function Seg<T extends string>({ value, options, onPick, label }: { value: T; options: Record<T, string>; onPick: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit flex-wrap border border-input bg-card">
      {(Object.entries(options) as [T, string][]).map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onPick(v)}
          className="border-r border-input px-2.5 py-1 text-xs transition-colors last:border-r-0 hover:bg-secondary aria-checked:bg-foreground aria-checked:text-background"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function NumField({ field, label, p, ...rest }: { field: Field; label: string; p: PageProps } & React.ComponentProps<typeof Input>) {
  const error = problems(p.draft, p.ctx, p.mode).errors[field];
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        value={p.draft.v[field]}
        onChange={(e) => p.onChange({ ...p.draft, v: { ...p.draft.v, [field]: field === 'channel' ? e.target.value.toLowerCase() : e.target.value } })}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-8 w-[150px] font-mono text-[13px] text-foreground"
        {...rest}
      />
    </label>
  );
}

const Errors = ({ p, fields }: { p: PageProps; fields: Field[] }) => {
  const e = problems(p.draft, p.ctx, p.mode).errors;
  return (
    <>
      {fields.flatMap((f) => (e[f] ? [<em key={f} className="text-[11px] text-fail not-italic">{e[f]}</em>] : []))}
    </>
  );
};

/** One setting: what it inherits and from where, an Override switch, and its controls once overridden. */
function Setting({ k, title, p, children, footnote }: { k: SettingKey; title: string; p: PageProps; children: ReactNode; footnote?: ReactNode }) {
  const own = p.mode === 'app' || p.draft.ov[k];
  const from = p.mode === 'app' ? 'app settings' : own ? 'this project' : fromLabel(p.ctx.base[k].from, p.ctx.typeName);
  return (
    <section className={`grid gap-2 border-b border-border px-3.5 py-3 last:border-b-0 ${own && p.mode !== 'app' ? 'bg-card shadow-[inset_3px_0_0_var(--run)]' : ''}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <b className="font-sans text-sm font-semibold">{title}</b>
        <span className={`border px-1.5 text-[11px] ${own && p.mode !== 'app' ? 'border-run text-run' : 'border-border text-muted-foreground'}`}>{from}</span>
        <span className="flex-1" />
        {p.mode === 'project' && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ink-2)]">
            <input type="checkbox" className="m-0 accent-[var(--run)]" checked={p.draft.ov[k]} onChange={(e) => p.onChange(toggle(p.draft, k, e.target.checked, p.ctx.base))} />
            override
          </label>
        )}
      </div>
      {own ? children : <div className="text-[var(--ink-2)]">{describe(k, p.ctx.base[k].value)}</div>}
      {footnote && <p className={desc}>{footnote}</p>}
    </section>
  );
}

const Sets = ({ children }: { children: ReactNode }) => <div className="border border-border">{children}</div>;
const set = (p: PageProps, v: Partial<Values>) => p.onChange({ ...p.draft, v: { ...p.draft.v, ...v } });
const onOff = { false: 'Off', true: 'On' } as const;

function Warnings({ p, page }: { p: PageProps; page: PageId }) {
  const w = problems(p.draft, p.ctx, p.mode).warns.filter((x) => x.page === page);
  return w.length ? <div className="mt-3 grid gap-2">{w.map((x) => <Warn key={x.text}>{x.text}</Warn>)}</div> : null;
}

const PAGES: Record<Exclude<PageId, 'overview'>, (p: PageProps) => ReactNode> = {
  sandbox: (p) => (
    <>
      <Sets>
        <Setting k="trust" title="Isolation" p={p} footnote={NOT_YET}>
          <Seg label="Isolation" value={p.draft.v.trust} options={{ trusted: `${TRUST.trusted.label} · ${TRUST.trusted.tier}`, normal: `${TRUST.normal.label} · ${TRUST.normal.tier}`, untrusted: `${TRUST.untrusted.label} · ${TRUST.untrusted.tier}` }} onPick={(trust) => set(p, { trust })} />
          <p className={desc}>{TRUST[p.draft.v.trust].text}</p>
        </Setting>
        {p.mode === 'project' && (
          <section className="grid gap-2 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <b className="font-sans text-sm font-semibold">Resource limits</b>
              <span className="border border-border px-1.5 text-[11px] text-muted-foreground">{limitsText(p.draft.v) ? 'this repo' : 'Docker’s defaults'}</span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <NumField field="memMb" label="memory, MB" p={p} placeholder="a quarter of Docker’s" inputMode="numeric" />
              <NumField field="cpus" label="CPUs" p={p} placeholder="any" inputMode="decimal" />
            </div>
            <Errors p={p} fields={['memMb', 'cpus']} />
            <p className={desc}>Per container, for every sandboxed step. Kept in the repo&apos;s .flowboard.yaml, so they travel with the code.</p>
          </section>
        )}
      </Sets>
      <Warnings p={p} page="sandbox" />
    </>
  ),
  network: () => (
    <Sets>
      <section className="grid gap-2 border-b border-border px-3.5 py-3">
        <b className="font-sans text-sm font-semibold">Always</b>
        <div className="text-[var(--ink-2)]">the AI service the agents use</div>
      </section>
      <section className="grid gap-2 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <b className="font-sans text-sm font-semibold">Package registries</b>
          <span className="border border-border px-1.5 text-[11px] text-muted-foreground">after cloning</span>
        </div>
        <div className="text-[var(--ink-2)]">proposed by the analysis agent from the repo&apos;s lockfiles; you confirm them</div>
        <p className={desc}>Never the git remote: FlowBoard does every fetch and push itself, outside the sandbox.</p>
      </section>
    </Sets>
  ),
  budget: (p) => (
    <Sets>
      <Setting k="budget" title="Monthly cap" p={p} footnote={`Everything the project’s runs cost counts, the analysis agent’s included. Each flow’s own budget still applies inside it. ${NOT_YET}`}>
        <div className="flex flex-wrap items-end gap-3">
          <NumField field="cap" label="$ per month" p={p} inputMode="decimal" placeholder={p.mode === 'app' ? 'no cap' : undefined} />
          <NumField field="alertAt" label="alert at, %" p={p} inputMode="numeric" />
          <span className="grid gap-1 text-[11px] text-muted-foreground">
            when it is spent
            <Seg label="When it is spent" value={p.draft.v.onLimit} options={ON_LIMIT} onPick={(onLimit) => set(p, { onLimit })} />
          </span>
        </div>
        <Errors p={p} fields={['cap', 'alertAt']} />
      </Setting>
    </Sets>
  ),
  escalation: (p) => (
    <Sets>
      <Setting k="escalation" title="Chat" p={p} footnote={NOT_YET}>
        <div className="flex flex-wrap items-end gap-3">
          <NumField field="channel" label="Slack channel" p={p} />
          <NumField field="nudge" label="after, minutes" p={p} inputMode="numeric" />
        </div>
        <Errors p={p} fields={['channel', 'nudge']} />
      </Setting>
    </Sets>
  ),
  memory: (p) => (
    <Sets>
      <Setting k="memory" title="Project memory" p={p} footnote={`Memory’s project scope. ${NOT_YET}`}>
        <Seg label="Project memory" value={String(p.draft.v.memory) as 'true' | 'false'} options={onOff} onPick={(v) => set(p, { memory: v === 'true' })} />
      </Setting>
    </Sets>
  ),
  knowledge: (p) => {
    const kn = p.draft.v.knowledge;
    const r = p.ctx.repo;
    const asset = (id: 'serena' | 'graphify') => (
      <div key={id} className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border py-2 first:border-t-0 first:pt-0">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b>{KNOWLEDGE[id].name}</b>
          <small className="font-sans text-xs text-muted-foreground">{KNOWLEDGE[id].what}</small>
          <small className="font-sans text-xs text-muted-foreground">
            {id === 'graphify' && r?.sizeKb !== undefined ? `${KNOWLEDGE[id].cost}: about $${graphifyCost(r.sizeKb)} a rebuild for ${r.name}` : KNOWLEDGE[id].cost} · {KNOWLEDGE[id].via}
          </small>
        </div>
        <Seg label={KNOWLEDGE[id].name} value={String(kn[id]) as 'true' | 'false'} options={{ true: 'On', false: 'Off' }} onPick={(v) => set(p, { knowledge: { ...kn, [id]: v === 'true' } })} />
      </div>
    );
    return (
      <>
        <Sets>
          <Setting k="knowledge" title="Knowledge assets" p={p} footnote={`Kept in .flowboard/knowledge/ in the clone, out of commits, and built first right after cloning. Serena never leaves this machine; graphify does, to the AI service. ${NOT_YET}`}>
            {asset('serena')}
            {asset('graphify')}
            <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border py-2">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <b>Rebuild</b>
                <small className="font-sans text-xs text-muted-foreground">a map built from an older commit is marked stale, so agents know not to trust it</small>
              </div>
              <Seg label="Rebuild" value={kn.rebuild} options={{ ...REBUILD, push: r?.branch ? `on ${r.branch} moving` : REBUILD.push }} onPick={(rebuild) => set(p, { knowledge: { ...kn, rebuild } })} />
            </div>
          </Setting>
        </Sets>
        <Warnings p={p} page="knowledge" />
      </>
    );
  },
  draft: (p) => (
    <Sets>
      <Setting k="draft" title="Draft mode" p={p} footnote={NOT_YET}>
        <Seg label="Draft mode" value={String(p.draft.v.draft) as 'true' | 'false'} options={onOff} onPick={(v) => set(p, { draft: v === 'true' })} />
      </Setting>
    </Sets>
  ),
};

/** Each page's state for its mark: an error on it, a warning worth a look, or overridden. */
export function pageState(p: PageProps, id: PageId): 'bad' | 'caution' | 'own' | '' {
  const def = SETTING_PAGES.find((x) => x.id === id)!;
  const pr = problems(p.draft, p.ctx, p.mode);
  if ((def.errs ?? []).some((f) => pr.errors[f])) return 'bad';
  if (pr.warns.some((w) => w.caution && w.page === id)) return 'caution';
  return def.key && p.mode === 'project' && p.draft.ov[def.key] ? 'own' : '';
}
export const MARK = { bad: 'border-fail bg-fail', caution: 'border-wait bg-wait', own: 'border-run bg-run', '': 'border-input bg-card' };

/** The overview: the facts the caller knows (the repo's, in the wizard), then every setting as a row to open. */
function Overview({ p, facts, onPage }: { p: PageProps; facts?: ReactNode; onPage: (id: PageId) => void }) {
  const s = summary(p.draft, p.ctx, p.mode);
  return (
    <>
      {facts}
      <div className="border border-border">
        {SETTING_PAGES.slice(1)
          .filter((x) => p.mode === 'project' || x.id !== 'network')
          .map((x) => {
            const state = pageState(p, x.id);
            const own = x.key && p.draft.ov[x.key] && p.mode === 'project';
            const value = x.id === 'network' ? 'the AI service; registries after cloning' : s[x.key!];
            const from = x.id === 'network' ? 'after cloning' : p.mode === 'app' ? 'app settings' : own ? 'this project' : fromLabel(p.ctx.base[x.key!].from, p.ctx.typeName);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onPage(x.id)}
                className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 border-b border-border px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-secondary sm:grid-cols-[120px_minmax(0,1fr)_auto]"
              >
                <b className={`font-sans font-semibold ${state === 'bad' ? 'text-fail' : state === 'caution' ? 'text-wait' : ''}`}>{x.title}</b>
                <span className="col-span-full row-start-2 text-xs [overflow-wrap:anywhere] text-[var(--ink-2)] sm:col-span-1 sm:row-start-auto">{value}</span>
                <span className={`border px-1.5 text-[11px] ${own ? 'border-run text-run' : 'border-border text-muted-foreground'}`}>{from}</span>
              </button>
            );
          })}
      </div>
    </>
  );
}

/** One page's body. `facts`: what the overview shows above the settings. */
export function SettingPage({ page, facts, onPage, ...p }: PageProps & { page: PageId; facts?: ReactNode; onPage: (id: PageId) => void }) {
  return page === 'overview' ? <Overview p={p} facts={facts} onPage={onPage} /> : <>{PAGES[page](p)}</>;
}

/** The pages listed beside the page shown, for the project page and the app settings page. */
export function SettingsPanel({ page, onPage, ...p }: PageProps & { page: PageId; onPage: (id: PageId) => void }) {
  const def = SETTING_PAGES.find((x) => x.id === page)!;
  const pages = SETTING_PAGES.filter((x) => p.mode === 'project' || x.id !== 'network');
  return (
    <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Settings" className="flex flex-wrap gap-0.5 md:grid md:content-start">
        {pages.map((x) => {
          const here = x.id === page;
          return (
            <button
              key={x.id}
              type="button"
              aria-current={here ? 'page' : undefined}
              onClick={() => onPage(x.id)}
              className={`grid grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-2 border-l-[3px] px-2.5 py-1 text-left text-xs whitespace-nowrap ${here ? 'border-run bg-card font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <i aria-hidden className={`size-[7px] border ${MARK[pageState(p, x.id)]}`} />
              <span className="truncate">{x.title}</span>
              <small className="max-w-[70px] truncate text-[10px] text-run">{p.mode === 'project' ? note(p.draft, x.key) : ''}</small>
            </button>
          );
        })}
      </nav>
      <div className="grid min-w-0 content-start gap-2">
        <div>
          <h3 className="m-0 font-sans text-[15px] font-semibold">{def.title}</h3>
          <p className="m-0 font-sans text-xs text-[var(--ink-2)]">{p.mode === 'app' && def.id === 'overview' ? 'What every project inherits until its type or the project itself sets otherwise.' : def.intro}</p>
        </div>
        <SettingPage page={page} onPage={onPage} {...p} />
      </div>
    </div>
  );
}
