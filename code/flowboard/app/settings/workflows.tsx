'use client';
/**
 * The Workflows section: the flows FlowBoard ships, by domain (a domain is a project type). Only Software's delivery
 * and review-loop exist; every other entry is an example, there to show how the page reads with many domains.
 */
import { BookOpen, Code, Database, type LucideIcon, PenLine, Search, ShieldCheck, Palette } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { PROJECT_TYPES, type ProjectTypeId } from '../../packages/cli/src/settings.ts';
import { Head } from './settings.tsx';

/** `steps`: in order; `loop`: work goes back round until it passes; `gate`: waits for your approval. */
interface Shipped { name: string; text: string; steps: string[]; loop?: boolean; gate?: boolean; example?: true }
interface Domain { id: string; name: string; text: string; icon: LucideIcon; soon?: boolean; example?: true; flows: Shipped[] }

const ex = (name: string, text: string, steps: string[], more: Partial<Shipped> = {}): Shipped => ({ name, text, steps, example: true, ...more });

// ponytail: the two real flows' steps are written out, not read from flows/; read the library once more ship.
const FLOWS: Record<ProjectTypeId, Shipped[]> = {
  software: [
    { name: 'delivery', text: 'Plan, then implement and write tests side by side; a check gates the review, and failures go back to implement.', steps: ['plan', 'implement', 'tests', 'check', 'review'], loop: true, gate: true },
    { name: 'review-loop', text: 'A reviewer sends the work back to its implementer until a review passes.', steps: ['implement', 'review'], loop: true },
    ex('bugfix', 'Reproduce the bug in a failing test, fix it, and prove the test now passes.', ['reproduce', 'fix', 'check', 'review'], { loop: true }),
    ex('dependency-upgrade', 'Upgrade one dependency, fix what breaks, and summarise the changelog for review.', ['upgrade', 'fix', 'check', 'summarise']),
    ex('refactor', 'Restructure code without changing behaviour; the existing tests are the contract.', ['plan', 'refactor', 'check', 'review'], { gate: true, loop: true }),
    ex('test-backfill', 'Find untested code and write tests for it, without touching the code itself.', ['survey', 'tests', 'check']),
    ex('security-patch', 'Fix a reported vulnerability, add a regression test, and draft the advisory.', ['triage', 'fix', 'tests', 'check', 'advisory'], { gate: true }),
  ],
  research: [
    ex('answer-with-citations', 'Answer a question from sources, every claim cited and the sources kept as artifacts.', ['search', 'read', 'answer', 'verify'], { loop: true }),
    ex('literature-scan', 'Collect and summarise what has been written on a topic, newest first.', ['search', 'screen', 'summarise']),
    ex('compare-options', 'Compare tools or approaches against criteria you approve first.', ['criteria', 'research', 'compare', 'recommend'], { gate: true }),
    ex('fact-check', 'Check each claim in a document against sources and mark what does not hold.', ['extract', 'check', 'report']),
  ],
  writing: [
    ex('draft-review-edit', 'Draft from an outline, review against a style guide, and edit until it passes.', ['outline', 'draft', 'review', 'edit'], { gate: true, loop: true }),
    ex('release-notes', "Turn a release's merged changes into notes a user reads.", ['collect', 'draft', 'review']),
    ex('docs-from-code', 'Write reference docs from the code, and check every snippet runs.', ['survey', 'draft', 'verify'], { loop: true }),
    ex('translate', 'Translate a document and have a second agent review the translation.', ['translate', 'review'], { loop: true }),
  ],
  data: [
    ex('notebook-check', 'Run every notebook top to bottom and fix what fails.', ['run', 'fix', 'run'], { loop: true }),
    ex('pipeline-fix', 'Find why a pipeline run failed, fix it, and rerun it on a sample.', ['diagnose', 'fix', 'sample-run'], { loop: true }),
    ex('schema-migration', 'Plan a schema change, write the migration and its rollback, and test both.', ['plan', 'migrate', 'rollback', 'check'], { gate: true }),
    ex('data-quality-report', 'Profile a dataset and report nulls, outliers and drift since the last run.', ['profile', 'compare', 'report']),
  ],
};

const ICONS: Record<ProjectTypeId, LucideIcon> = { software: Code, research: BookOpen, writing: PenLine, data: Database };

const DOMAINS: Domain[] = [
  ...(Object.keys(PROJECT_TYPES) as ProjectTypeId[]).map((id) => ({ ...PROJECT_TYPES[id], icon: ICONS[id], flows: FLOWS[id] })),
  {
    id: 'operations',
    name: 'Operations',
    text: 'Incidents, runbooks and on-call, worked on alongside the systems they describe.',
    icon: ShieldCheck,
    example: true as const,
    flows: [
      ex('incident-triage', 'Gather logs and recent changes for an alert and propose the likely cause.', ['gather', 'correlate', 'propose'], { gate: true }),
      ex('runbook-check', 'Walk a runbook against the live config and flag the steps that no longer match.', ['read', 'check', 'report']),
      ex('on-call-summary', "Summarise a shift's alerts and what was done about each.", ['collect', 'summarise']),
    ],
  },
  {
    id: 'design',
    name: 'Design',
    text: 'Interfaces reviewed and built from mockups.',
    icon: Palette,
    example: true as const,
    flows: [
      ex('mockup-to-code', 'Build a screen from a mockup and compare screenshots until they match.', ['build', 'screenshot', 'compare'], { loop: true }),
      ex('accessibility-audit', 'Check a page against WCAG and fix what can be fixed in code.', ['audit', 'fix', 'recheck'], { loop: true }),
      ex('ui-review', "Review a change's screens against the design system and list what differs.", ['capture', 'review']),
    ],
  },
];

const tag = 'border px-1.5 text-[11px] whitespace-nowrap';

function FlowRow({ f, first }: { f: Shipped; first: boolean }) {
  return (
    <li className="grid gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-wrap items-center gap-1.5">
        {f.example ? <b className="font-mono text-[13px]">{f.name}</b> : (
          <Link href={`/flows?flow=${f.name}`} className="font-mono text-[13px] font-bold underline decoration-border underline-offset-2 hover:decoration-foreground">
            {f.name}
          </Link>
        )}
        {first && <span className={`${tag} border-run text-run`}>default</span>}
        {f.example && <span className={`${tag} border-dashed border-input text-muted-foreground`}>example</span>}
      </div>
      <div className="grid min-w-0 gap-1">
        <p className="m-0 font-sans text-xs text-[var(--ink-2)]">{f.text}</p>
        <p className="m-0 font-mono text-[11px] [overflow-wrap:anywhere] text-muted-foreground">
          {f.steps.join(' → ')}
          {f.loop && <span title="work goes back round until it passes"> ↺</span>}
          {f.gate && <span className="text-wait"> · waits for your approval</span>}
          <span> · {f.steps.length} steps</span>
        </p>
      </div>
    </li>
  );
}

export function WorkflowsPage() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = DOMAINS.map((d) => ({ ...d, flows: d.flows.filter((f) => !term || `${f.name} ${f.text} ${f.steps.join(' ')}`.toLowerCase().includes(term)) })).filter((d) => d.flows.length);
  const total = DOMAINS.reduce((n, d) => n + d.flows.length, 0);
  return (
    <>
      <Head title="Workflows">The flows FlowBoard ships, by domain. A new project runs its domain&apos;s flows; the first is its default.</Head>
      <p className="m-0 border-l-[3px] border-input bg-card px-2.5 py-1.5 font-sans text-xs text-[var(--ink-2)]">
        Only Software&apos;s <b>delivery</b> and <b>review-loop</b> ship today. Everything marked <i>example</i> is a placeholder showing how this page reads with many domains.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Find a workflow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a workflow or a step" className="h-8 pl-8 font-sans text-[13px]" />
        </label>
        <nav aria-label="Domains" className="flex flex-wrap gap-1">
          {shown.map((d) => (
            <a key={d.id} href={`#domain-${d.id}`} className="border border-border bg-card px-2 py-0.5 font-sans text-xs text-[var(--ink-2)] hover:border-foreground hover:text-foreground">
              {d.name} <span className="text-muted-foreground">{d.flows.length}</span>
            </a>
          ))}
        </nav>
      </div>
      {shown.length === 0 && <p className="m-0 text-muted-foreground">No workflow matches “{q.trim()}” among {total}.</p>}
      {shown.map((d) => (
        <section key={d.id} id={`domain-${d.id}`} aria-label={d.name} className="grid scroll-mt-4 gap-2">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <d.icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="m-0 font-sans text-sm font-semibold">{d.name}</h3>
            <span className="text-xs text-muted-foreground">{d.flows.length} {d.flows.length === 1 ? 'flow' : 'flows'}</span>
            {d.soon && <span className={`${tag} border-border text-muted-foreground`}>project type coming soon</span>}
            {d.example && <span className={`${tag} border-dashed border-input text-muted-foreground`}>example domain</span>}
            <p className="m-0 basis-full font-sans text-xs text-[var(--ink-2)]">{d.text}</p>
          </header>
          <ul className="m-0 list-none border border-border bg-card p-0">
            {d.flows.map((f) => (
              <FlowRow key={f.name} f={f} first={f === DOMAINS.find((x) => x.id === d.id)!.flows[0]} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
