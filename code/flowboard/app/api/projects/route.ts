import { connection } from 'next/server';
import { z } from 'zod';
import { listRuns } from '../../../packages/cli/src/flow-logs.ts';
import { createProject, readProjects, seedOnce, viewProjects } from '../../../packages/cli/src/projects.ts';
import { type Overrides, readAppSettings } from '../../../packages/cli/src/settings.ts';
import { body, dataDir, flowsDir, refused, runsDir } from '../flows/local.ts';

/** Every project, with its runs counted by status and the last seven days' spend. The first call seeds one. */
export async function GET(request: Request) {
  await connection(); // the list is read on every request, never at build time
  const no = refused(request);
  if (no) return no;
  seedOnce(dataDir(), flowsDir());
  return Response.json(viewProjects(readProjects(dataDir()), listRuns(runsDir()), flowsDir(), readAppSettings(dataDir())));
}

/** The shape only; `createProject` checks the values (overrides, limits) and says what is wrong with them. */
const Create = z.object({
  name: z.string(),
  repoPath: z.string(),
  type: z.enum(['software', 'research', 'writing', 'data']),
  slug: z.string().optional(),
  owner: z.string().optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  limits: z.object({ memoryMb: z.number().optional(), cpus: z.number().optional() }).optional(),
  checkCommand: z.string().optional(),
});

/**
 * A project from a git repo already on this machine, `{ name, repoPath, type, slug?, owner?, overrides?, limits?,
 * checkCommand? }`: 201, or 400/409 with why. The wizard clones instead (`/api/projects/clone`).
 */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Create.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { name, repoPath, type, slug?, owner?, overrides?, limits?, checkCommand? }' }, { status: 400 });
  const r = createProject(dataDir(), flowsDir(), { ...input.data, overrides: input.data.overrides as Overrides | undefined });
  return r.ok ? Response.json(r.value, { status: 201 }) : Response.json({ error: r.error }, { status: r.status });
}
