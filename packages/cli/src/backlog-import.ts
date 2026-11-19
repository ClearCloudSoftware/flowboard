/**
 * Importing an existing markdown backlog into a project. The `backlog-importer` internal step reads it and maps each
 * piece of work to a task (title, body, acceptance criteria, non-goals): a run of the project like the repo analyst,
 * with the backlog's text as its task (the step has no tool to read a path). The page polls `agentImport` until the
 * run ends; its tasks then go through the server's `keyTasks` and the upsert.
 *
 * On any failure (the run cannot start, fails, pauses, or writes nothing readable) the deterministic parser
 * (`MarkdownTaskSource`) reads the same text instead, and the result says which path ran and why (backlog 7.3).
 * The `backlog_imports` table (`db.ts`) keeps each import's project, its text until the tasks are saved, then the
 * result, so a second poll repeats the counts instead of importing again.
 */
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { keyTasks, type ParsedTask } from '@lamproom/core';
import { parseMarkdown } from '@lamproom/adapters';
import { readAppSettings } from './app-settings.ts';
import { isFile } from './config.ts';
import { db } from './db.ts';
import { readArtifact, readRun, type RunStatus } from './flow-logs.ts';
import { startRun } from './flow-start.ts';
import { internalFlowText } from './internal-steps.ts';
import { owns, type Project } from './projects.ts';
import { upsertTasks, type UpsertCounts } from './tasks.ts';

/** A backlog larger than this is not one a person keeps by hand. */
export const MAX_BACKLOG_BYTES = 256 * 1024;

/** Pasted or uploaded text, or a file in the project's repo: exactly one. */
export interface ImportInput { content?: string; path?: string }

/** `by`: which path read the backlog; `fallback`: why the parser read it instead of the agent. */
export type Imported = UpsertCounts & { by: 'agent' | 'parser'; fallback?: string };
export type ImportStarted = { ok: true; run: string } | { ok: true; imported: Imported } | { ok: false; status: 400 | 422; error: string };
export type AgentImport = { status: 'running' } | { status: 'done'; imported: Imported } | { status: 'failed'; error: string };

const bad = (error: string) => ({ ok: false as const, status: 400 as const, error });

/** The backlog's text: `content`, or the file at `path`, which must be in the project's repo (the API has no login). */
function textOf(project: Project, input: ImportInput): { ok: true; text: string } | { ok: false; status: 400; error: string } {
  if ((input.content === undefined) === (input.path === undefined)) return bad('send the backlog as content or as a path in the repo, one of them');
  if (input.content !== undefined) {
    return Buffer.byteLength(input.content) > MAX_BACKLOG_BYTES ? bad(`the backlog is larger than ${MAX_BACKLOG_BYTES / 1024} KB`) : { ok: true, text: input.content };
  }
  const path = isAbsolute(input.path!) ? input.path! : join(project.repoPath, input.path!);
  if (!isFile(path)) return bad(`${input.path}: no such file`);
  // The real path, so a symlink in the repo cannot reach a file outside it.
  if (!owns(project, realpathSync.native(path))) return bad(`${input.path}: not a file in ${project.repoPath}`);
  if (statSync(path).size > MAX_BACKLOG_BYTES) return bad(`${input.path} is larger than ${MAX_BACKLOG_BYTES / 1024} KB`);
  return { ok: true, text: readFileSync(path, 'utf8') };
}

/** The parser on `text`, for when the agent path failed `why`; finding no task either is the import's failure. */
async function byParser(dataDir: string, projectId: string, text: string, why: string): Promise<Exclude<AgentImport, { status: 'running' }>> {
  const parsed = parseMarkdown(text);
  if (!parsed.length) return { status: 'failed', error: `${why}, and the parser found no task in the backlog either` };
  return { status: 'done', imported: { ...(await upsertTasks(dataDir, projectId, parsed)), by: 'parser', fallback: why } };
}

/** Starts importing a backlog into `project`: the importer's run, or the parser's counts when the run cannot start. */
export async function importBacklog(dataDir: string, runsDir: string, project: Project, input: ImportInput, start = startRun): Promise<ImportStarted> {
  const read = textOf(project, input);
  if (!read.ok) return read;
  if (!read.text.trim()) return bad('the backlog is empty');

  const dir = join(dataDir, 'internal');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'backlog-importer.yaml'), internalFlowText('backlog-importer', readAppSettings(dataDir).internal['backlog-importer']));
  const r = await start(runsDir, dir, { flow: 'backlog-importer', folder: project.repoPath, task: read.text, allowDirty: true }, dataDir);
  if (!r.ok) {
    const res = await byParser(dataDir, project.id, read.text, `the importer agent did not start: ${r.error}`);
    return res.status === 'done' ? { ok: true, imported: res.imported } : { ok: false, status: 422, error: res.error };
  }
  await db(dataDir).backlogImport.create({ data: { run: r.name, projectId: project.id, text: read.text } });
  return { ok: true, run: r.name };
}

const AgentTasks = z.array(
  z.object({
    title: z.string(),
    body: z.string().optional(),
    acceptance_criteria: z.array(z.string()).optional(),
    non_goals: z.array(z.string()).optional(),
    import_key: z.string().optional(),
  }),
);

/**
 * The agent's output as tasks: the first `[` to the last `]` of its file, as JSON. Its `import_key` is kept only as
 * an explicit id found word for word in the backlog (the skill copies one from the file); one it made up, or any
 * key it slugged itself, is dropped and the key derived from the title like the parser's. An empty list is not
 * read as "no tasks": a backlog the agent found nothing in goes to the parser.
 */
export function agentTasks(output: string, text: string): { ok: true; tasks: ParsedTask[] } | { ok: false; error: string } {
  const from = output.indexOf('[');
  const to = output.lastIndexOf(']');
  let json: unknown;
  try {
    json = from < 0 || to < from ? undefined : JSON.parse(output.slice(from, to + 1));
  } catch {
    json = undefined;
  }
  const r = AgentTasks.safeParse(json);
  if (!r.success) return { ok: false, error: 'the importer agent wrote no task list Lamproom can read' };
  const tasks = keyTasks(r.data.map(({ import_key, body, ...t }) => ({ ...t, body: body?.trim() || undefined, id: import_key && text.includes(import_key) ? import_key : undefined })));
  return tasks.length ? { ok: true, tasks } : { ok: false, error: 'the importer agent found no task' };
}

/** What `agentImport` needs of a run: its status, and once done, its `tasks` output. */
export type RunLook = (run: string) => { status: RunStatus; output?: string } | undefined;
const lookRun = (runsDir: string): RunLook => (run) => {
  const r = readRun(runsDir, run);
  return r && { status: r.status, ...(r.status === 'done' && { output: readArtifact(runsDir, run, 'tasks') }) };
};

/**
 * Where the import of run `run` stands; once its run ends, its tasks are imported, once. Undefined when unknown here.
 * The poll that moves the row from `running` to `applying` saves the tasks; one arriving meanwhile is told it is
 * still running.
 */
export async function agentImport(dataDir: string, runsDir: string, projectId: string, run: string, look: RunLook = lookRun(runsDir)): Promise<AgentImport | undefined> {
  const rows = db(dataDir).backlogImport;
  const rec = await rows.findUnique({ where: { run } });
  if (!rec || rec.projectId !== projectId) return undefined;
  if (rec.state === 'settled') return rec.result as AgentImport;
  const r = look(run);
  if (rec.state === 'applying' || (r && ['starting', 'running', 'waiting'].includes(r.status))) return { status: 'running' };
  const { count } = await rows.updateMany({ where: { run, state: 'running' }, data: { state: 'applying' } });
  if (!count) return { status: 'running' };
  const text = rec.text ?? '';
  let result: Exclude<AgentImport, { status: 'running' }>;
  try {
    if (!r) result = await byParser(dataDir, projectId, text, 'the importer’s run is gone');
    else if (r.status === 'paused') result = await byParser(dataDir, projectId, text, 'the importer’s run paused');
    else if (r.status === 'failed') result = await byParser(dataDir, projectId, text, 'the importer agent failed');
    else {
      const out = agentTasks(r.output ?? '', text);
      result = out.ok ? { status: 'done', imported: { ...(await upsertTasks(dataDir, projectId, out.tasks)), by: 'agent' } } : await byParser(dataDir, projectId, text, out.error);
    }
  } catch (e) {
    // The upsert is one transaction: nothing was saved. Settled as failed, so the row never stays `applying`.
    result = { status: 'failed', error: `saving the tasks failed: ${(e as Error).message}` };
  }
  // The text is only needed until now.
  await rows.update({ where: { run }, data: { state: 'settled', result, text: null } });
  return result;
}
