/**
 * The repo analyst as a run of its project: read from its run folder when a page asks, so nothing lives in the
 * server's memory and a restart loses nothing. `analysis.ts` holds the proposal's shape.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AnalysisView, parseProposal } from './analysis.ts';
import { readAppSettings } from './app-settings.ts';
import { readArtifact, readRun } from './flow-logs.ts';
import { startRun } from './flow-start.ts';
import { internalFlowText } from './internal-steps.ts';
import { type Project, setAnalysisRun } from './projects.ts';

/** A proposal larger than this is not one the skill writes. */
const MAX_BYTES = 64 * 1024;

/** The analysis whose run is `run` in `runsDir`, as it stands now. */
export function analysisView(runsDir: string, run: string): AnalysisView {
  const r = readRun(runsDir, run);
  if (!r) return { run, status: 'failed', spentUsd: 0, error: 'the run is gone' };
  const base = { run, spentUsd: r.spentUsd };
  if (r.status === 'starting' || r.status === 'running' || r.status === 'waiting') return { ...base, status: 'running' };
  if (r.status === 'paused') return { ...base, status: 'paused', error: 'the run paused; see its page' };
  if (r.status === 'failed') return { ...base, status: 'failed', error: 'the run failed' };
  const file = r.artifacts.find((a) => a.type === 'proposal');
  if (!file) return { ...base, status: 'failed', error: 'the analyst wrote no proposal' };
  if (statSync(file.file).size > MAX_BYTES) return { ...base, status: 'failed', error: `the proposal is larger than ${MAX_BYTES / 1024} KB` };
  const p = parseProposal(readArtifact(runsDir, run, 'proposal') ?? '');
  return p.ok ? { ...base, status: 'done', proposal: p.proposal } : { ...base, status: 'failed', error: p.error };
}

/** The task the analyst runs on: its skill says the rest. */
export const ANALYST_TASK = 'Analyse this repository: propose its stack, its check command and the network hosts its sandbox must reach.';

/**
 * Starts the repo analyst on `project`: a run of the project like any other (its isolation, its monthly cap, the
 * folder lock), on the internal flow with the app's settings for it, and keeps the run's name on the record. It edits
 * nothing, so uncommitted changes do not stop it. A refusal keeps nothing and says lr-run-flow's words.
 */
export async function startAnalysis(dataDir: string, runsDir: string, project: Project, start = startRun): Promise<{ ok: true; run: string } | { ok: false; error: string }> {
  const dir = join(dataDir, 'internal');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'repo-analyst.yaml'), internalFlowText('repo-analyst', readAppSettings(dataDir).internal['repo-analyst']));
  const r = await start(runsDir, dir, { flow: 'repo-analyst', folder: project.repoPath, task: ANALYST_TASK, allowDirty: true }, dataDir);
  if (!r.ok) return { ok: false, error: r.error };
  setAnalysisRun(dataDir, project.id, r.name);
  return { ok: true, run: r.name };
}
