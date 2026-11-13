/**
 * The repo analyst as a run of its project: read from its run folder when a page asks, so nothing lives in the
 * server's memory and a restart loses nothing. `analysis.ts` holds the proposal's shape.
 */
import { statSync } from 'node:fs';
import { type AnalysisView, parseProposal } from './analysis.ts';
import { readArtifact, readRun } from './flow-logs.ts';

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
