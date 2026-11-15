/**
 * Building a project's knowledge assets as a run of the project (`knowledge.ts` has the script), and reading where
 * they stand from that run and from git, so nothing lives in the server's memory. The record keeps only the build's
 * run and the commit it mapped; `stamp.json` in the repo is for agents and is never read back, as a run may write it.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostGit } from '@flowboard/adapters';
import { stringify } from 'yaml';
import { readAppSettings } from './app-settings.ts';
import { readArtifact, readRun } from './flow-logs.ts';
import { startRun } from './flow-start.ts';
import { INTERNAL_DIR } from './internal-steps.ts';
import { buildCommand, FAILED, type KnowledgeView } from './knowledge.ts';
import { type Project, setKnowledgeBuild } from './projects.ts';
import { type Knowledge, resolveSettings } from './settings.ts';

/** The task a build runs on; its shell step never reads it. */
export const KNOWLEDGE_TASK = "Build the project's knowledge assets: graphify's code map and Serena's symbol index.";
export const FLOW = 'knowledge-build';

/** FlowBoard's Serena home on this machine: its config (`internal/knowledge/serena_config.yml`) and the language servers it downloads. */
export const serenaHome = (dataDir: string) => join(dataDir, 'serena');
/** Writes FlowBoard's Serena config into its home here; the image has its own copy. */
export function writeSerenaConfig(dataDir: string): string {
  const home = serenaHome(dataDir);
  mkdirSync(home, { recursive: true });
  copyFileSync(join(INTERNAL_DIR, 'knowledge', 'serena_config.yml'), join(home, 'serena_config.yml'));
  return home;
}

/** The build's flow: one shell step, at most 20 minutes, its output kept as the `build` artifact. No `sandbox:`: the project's is used. */
export const knowledgeFlowText = (command: string) => stringify({ budget_usd: 0, steps: { build: { shell: command, produces: ['build'], timeout_minutes: 20 } } });

/** The project's knowledge setting, as it resolves now. */
export const knowledgeOf = (dataDir: string, p: Project): Knowledge => resolveSettings(readAppSettings(dataDir), p.type, p.overrides).knowledge.value;

/** `git rev-parse` of `ref` in the project's repo; undefined when there is no such commit or git refuses. */
export function revParse(repo: string, ref: string): string | undefined {
  const r = hostGit(repo, repo, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]);
  return 'refused' in r || r.status !== 0 ? undefined : r.stdout.trim();
}

/**
 * Starts a build of `project`'s maps: a run of the project like any other (its isolation, its monthly cap at $0, the
 * folder lock), on a flow written for it alone in the data folder, as the script depends on its settings and trust.
 * It maps the working tree, uncommitted changes included, and is recorded with HEAD. A refusal keeps nothing.
 */
export async function startKnowledgeBuild(dataDir: string, runsDir: string, project: Project, start = startRun): Promise<{ ok: true; run: string } | { ok: false; error: string }> {
  const kn = knowledgeOf(dataDir, project);
  if (!kn.graphify && !kn.serena) return { ok: false, error: 'knowledge assets are off for this project' };
  const here = resolveSettings(readAppSettings(dataDir), project.type, project.overrides).trust.value === 'trusted';
  const commit = revParse(project.repoPath, 'HEAD') ?? null;
  const dir = join(dataDir, 'internal', 'knowledge', project.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${FLOW}.yaml`), knowledgeFlowText(buildCommand(kn, commit, here ? { serenaHome: writeSerenaConfig(dataDir) } : undefined)));
  const r = await start(runsDir, dir, { flow: FLOW, folder: project.repoPath, task: KNOWLEDGE_TASK, allowDirty: true }, dataDir);
  if (!r.ok) return { ok: false, error: r.error };
  setKnowledgeBuild(dataDir, project.id, { run: r.name, commit });
  return { ok: true, run: r.name };
}

/** Where `project`'s maps stand: from its last build's run, and its base branch's tip against the commit mapped. */
export function knowledgeView(runsDir: string, project: Project, kn: Knowledge): KnowledgeView {
  if (!kn.graphify && !kn.serena) return { status: 'off' };
  const b = project.knowledgeBuild;
  if (!b) return { status: 'never' };
  const base = { run: b.run, commit: b.commit };
  const r = readRun(runsDir, b.run);
  if (!r) return { ...base, status: 'failed', error: 'the run is gone' };
  if (r.status === 'starting' || r.status === 'running' || r.status === 'waiting') return { ...base, status: 'building' };
  if (r.status === 'paused') return { ...base, status: 'failed', error: 'the run paused; see its page' };
  if (r.status === 'failed') {
    const last = (readArtifact(runsDir, b.run, 'build') ?? '').trim().split('\n').at(-1) ?? '';
    return { ...base, status: 'failed', error: last.startsWith(FAILED) ? last.slice(FAILED.length) : 'the run failed; see its page' };
  }
  const tip = project.baseBranch ? revParse(project.repoPath, `refs/heads/${project.baseBranch}`) : undefined;
  return tip && tip !== b.commit ? { ...base, status: 'stale', tip } : { ...base, status: 'built' };
}
