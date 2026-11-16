/**
 * Building a project's knowledge assets as a run of the project (`knowledge.ts` has the script), and reading where
 * they stand from that run and from git, so nothing lives in the server's memory. The record keeps only the build's
 * run and the commit it mapped; `stamp.json` in the repo is for agents and is never read back, as a run may write it.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostGit } from '@flowboard/adapters';
import { stringify } from 'yaml';
import { readAppSettings } from './app-settings.ts';
import { readArtifact, readRun, stopRun } from './flow-logs.ts';
import { startRun } from './flow-start.ts';
import { INTERNAL_DIR } from './internal-steps.ts';
import { buildCommand, FAILED, type KnowledgeView } from './knowledge.ts';
import { startAnalysis } from './analysis-run.ts';
import { type Project, readProjects, setKnowledgeBuild, startOf } from './projects.ts';
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
  if (r.status === 'starting' || r.status === 'running') return { ...base, status: 'building' };
  // A build has no person to ask: a step that timed out or whose box would not start opens a gate (`run_failed`) that
  // would hold the folder for good. Whoever reads it next stops it (`stopStuck`).
  if (r.status === 'waiting') return { ...base, status: 'failed', error: GATED };
  if (r.status === 'paused') return { ...base, status: 'failed', error: 'the run paused; see its page' };
  if (r.status === 'failed') return { ...base, status: 'failed', error: 'the run failed; see its page' };
  // The script ends 0 either way; its last line says whether a map failed.
  const last = (readArtifact(runsDir, b.run, 'build') ?? '').trim().split('\n').at(-1) ?? '';
  if (last.startsWith(FAILED)) return { ...base, status: 'failed', error: last.slice(FAILED.length) };
  const tip = project.baseBranch ? revParse(project.repoPath, `refs/heads/${project.baseBranch}`) : undefined;
  return tip && tip !== b.commit ? { ...base, status: 'stale', tip } : { ...base, status: 'built' };
}

type Started = { ok: true; run: string } | { ok: false; error: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** How long a build's run-flow may still hold the folder after its run says it ended. */
const LOCK_MS = 30_000;
/** How long a clone waits for its build: past the shell step's own 20 minutes, it is stopped. */
const DEADLINE_MS = 25 * 60_000;
const GATED = 'the build stopped at a gate; FlowBoard stops it';

/** Stops `project`'s build run when it waits at a gate, so it releases the folder; a stop already asked for is asked again, harmlessly. */
export function stopStuck(runsDir: string, project: Project): void {
  const run = project.knowledgeBuild?.run;
  if (run && readRun(runsDir, run)?.status === 'waiting') stopRun(runsDir, run);
}

/**
 * After a clone: the maps first, so the analyst can read them, then the analyst. Each line goes to `say` (the clone's
 * log). A build that cannot start or fails never stops the analyst; the analyst's own start is returned.
 */
export async function buildThenAnalyse(
  dataDir: string,
  runsDir: string,
  project: Project,
  say: (line: string) => void,
  deps: { build?: typeof startKnowledgeBuild; analyse?: typeof startAnalysis; pollMs?: number; deadlineMs?: number } = {},
): Promise<Started> {
  const { build = startKnowledgeBuild, analyse = startAnalysis, pollMs = 1000, deadlineMs = DEADLINE_MS } = deps;
  const kn = knowledgeOf(dataDir, project);
  if (kn.graphify || kn.serena) {
    const b = await build(dataDir, runsDir, project).catch((e: Error): Started => ({ ok: false, error: e.message }));
    if (!b.ok) say(`-- knowledge build not started: ${b.error.split('\n')[0]}`);
    else {
      say(`-- knowledge build started: run ${b.run}`);
      // ponytail: polls the run folder. A gate ends the wait, and so does the deadline; either way the run is stopped.
      const end = Date.now() + deadlineMs;
      while (['starting', 'running'].includes(readRun(runsDir, b.run)?.status ?? '') && Date.now() < end) await sleep(pollMs);
      if (['starting', 'running', 'waiting'].includes(readRun(runsDir, b.run)?.status ?? '')) stopRun(runsDir, b.run);
      const lock = join(project.repoPath, '.flowboard', 'lock');
      for (const until = Date.now() + LOCK_MS; existsSync(lock) && Date.now() < until; ) await sleep(pollMs);
      const v = knowledgeView(runsDir, readProjects(dataDir).find((p) => p.id === project.id) ?? project, kn);
      say(v.status === 'built' || v.status === 'stale' ? `-- knowledge built at ${v.commit ? v.commit.slice(0, 7) : 'a repo with no commits'}` : `-- knowledge build failed: ${v.error ?? `it ran past ${Math.round(deadlineMs / 60_000)} min and was stopped`}; the analysis starts anyway`);
    }
  }
  return analyse(dataDir, runsDir, project);
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Why a build of `p`'s maps is due now, or undefined. Never by hand-only, never while one builds. `daily`: a day after
 * the last build started. `push`: the base branch (`git`: the branch checked out and the base's tip) has moved past the
 * commit last mapped; only while it is checked out, as a build maps the working tree. A build that failed is not
 * started again until the base moves, or a day passes.
 */
export function dueBuild(p: Project, kn: Knowledge, view: KnowledgeView, git: { branch?: string; tip?: string }, now: number): string | undefined {
  if (kn.rebuild === 'manual' || view.status === 'off' || view.status === 'building') return undefined;
  if (kn.rebuild === 'daily') return !p.knowledgeBuild ? 'never built' : now - startOf(p.knowledgeBuild.run) >= DAY_MS ? 'a day since the last build' : undefined;
  if (!p.baseBranch || git.branch !== p.baseBranch || !git.tip) return undefined;
  if (!p.knowledgeBuild) return 'never built';
  return git.tip !== p.knowledgeBuild.commit ? `${p.baseBranch} moved to ${git.tip.slice(0, 7)}` : undefined;
}

/** The branch checked out in `repo`; undefined when HEAD is detached or git refuses. */
const branchOf = (repo: string) => {
  const r = hostGit(repo, repo, ['symbolic-ref', '--short', '-q', 'HEAD']);
  return 'refused' in r || r.status !== 0 ? undefined : r.stdout.trim();
};

/** One pass over the projects: each due build started in turn. A refusal is reported and tried again next pass. */
export async function knowledgeTick(dataDir: string, runsDir: string, now = Date.now(), start = startKnowledgeBuild): Promise<{ project: string; why: string; run?: string; error?: string }[]> {
  const out: { project: string; why: string; run?: string; error?: string }[] = [];
  for (const p of readProjects(dataDir)) {
    if (!existsSync(p.repoPath)) continue;
    stopStuck(runsDir, p);
    const kn = knowledgeOf(dataDir, p);
    const why = dueBuild(p, kn, knowledgeView(runsDir, p, kn), { branch: branchOf(p.repoPath), tip: p.baseBranch ? revParse(p.repoPath, `refs/heads/${p.baseBranch}`) : undefined }, now);
    if (!why) continue;
    const r = await start(dataDir, runsDir, p).catch((e: Error): Started => ({ ok: false, error: e.message }));
    out.push({ project: p.name, why, ...(r.ok ? { run: r.run } : { error: r.error.split('\n')[0] }) });
  }
  return out;
}

/**
 * Checks for due builds every `everyMs` (10 minutes) in this process, from the Next server's `instrumentation.ts`.
 * Once per process: a second call (a dev reload) gets the first timer. A pass still going skips the next.
 */
export function startScheduler(dataDir: string, runsDir: string, everyMs = 600_000, tick = knowledgeTick): NodeJS.Timeout {
  const g = globalThis as { __fbKnowledge?: NodeJS.Timeout };
  if (g.__fbKnowledge) return g.__fbKnowledge;
  let busy = false;
  const pass = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const r of await tick(dataDir, runsDir)) console.log(`-- knowledge: ${r.project}: ${r.why}; ${r.run ? `build started: run ${r.run}` : `build not started: ${r.error}`}`);
    } catch (e) {
      console.error(`-- knowledge: the scheduler's pass failed: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  };
  g.__fbKnowledge = setInterval(pass, everyMs);
  g.__fbKnowledge.unref();
  return g.__fbKnowledge;
}
