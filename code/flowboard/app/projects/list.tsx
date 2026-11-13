'use client';
/** The home screen: a card per project, with its runs by status and what it spent in the last seven days. */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FolderGit2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsQuery, usd } from './api.ts';
import type { ProjectView } from './api.ts';
import { Topbar } from './topbar.tsx';
import { Wizard } from './wizard/wizard.tsx';

/** The run statuses a card counts, in a run's order; `starting` is counted as running. */
const FIGURES = [
  { label: 'running', of: ['starting', 'running'], tone: 'text-run' },
  { label: 'waiting', of: ['waiting'], tone: 'text-wait' },
  { label: 'paused', of: ['paused'], tone: 'text-wait' },
  { label: 'done', of: ['done'], tone: 'text-foreground' },
  { label: 'failed', of: ['failed'], tone: 'text-fail' },
] as const;

export function Figures({ runs }: { runs: ProjectView['runs'] }) {
  return (
    <dl className="grid grid-cols-5 border border-border">
      {FIGURES.map((f) => {
        const n = f.of.reduce((sum, s) => sum + (runs[s] ?? 0), 0);
        return (
          <div key={f.label} className="border-r border-border px-2 py-1.5 last:border-r-0">
            <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{f.label}</dt>
            <dd className={`text-base tabular-nums ${n ? f.tone : 'text-input'}`}>{n}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ProjectCard({ p }: { p: ProjectView }) {
  return (
    <Card className="relative transition-colors hover:ring-muted-foreground/40">
      <CardHeader>
        <CardTitle className="font-sans text-[15px] font-semibold">
          {/* The whole card is the link; the title names it for a screen reader. */}
          <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:outline-ring">
            {p.name}
          </Link>
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          {p.slug}
          <span className="px-[0.45em] text-input">·</span>
          {p.defaultFlow ?? 'no default flow'}
        </CardDescription>
        <CardAction className="text-right">
          <div className="text-[15px] tabular-nums">{usd(p.weekSpendUsd)}</div>
          <div className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">last 7 days</div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Figures runs={p.runs} />
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={p.repoPath}>
          <FolderGit2 size={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
          <span className="truncate">{p.repoPath}</span>
        </p>
        {p.problems.length > 0 && (
          <p className="border-l-2 border-wait bg-[var(--wait-soft)] px-2 py-1 text-xs text-wait">
            {p.problems[0]}
            {p.problems.length > 1 && ` (+${p.problems.length - 1} more)`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function Projects() {
  const projects = useQuery(projectsQuery);
  const [creating, setCreating] = useState(false);
  const add = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus aria-hidden /> New project
    </Button>
  );
  return (
    <div className="flex min-h-dvh flex-col text-[13px]">
      <Topbar>{add}</Topbar>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-sans text-lg font-semibold">Projects</h1>
          <span className="text-muted-foreground">{projects.data ? projects.data.length : ''}</span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">Each one is a git repo on this machine. Runs in it are counted on its card.</span>
        </div>
        {projects.isPending && <p className="text-muted-foreground">Loading projects…</p>}
        {projects.isError && (
          <p role="alert" className="border-l-2 border-fail px-3 py-2 text-fail">
            {projects.error.message}
          </p>
        )}
        {projects.data?.length === 0 && (
          <div className="flex flex-col items-start gap-3 border border-dashed border-input px-5 py-8">
            <p className="font-sans text-[15px]">No projects yet.</p>
            <p className="text-muted-foreground">Clone a repository from GitHub. That is the code a flow&rsquo;s agents read and change.</p>
            {add}
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-4">
          {projects.data?.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      </main>
      {creating && <Wizard onClose={() => setCreating(false)} />}
    </div>
  );
}
