import { connection } from 'next/server';
import { z } from 'zod';
import { listRuns } from '../../../packages/cli/src/flow-logs.ts';
import { createProject, readProjects, seedOnce, viewProjects } from '../../../packages/cli/src/projects.ts';
import { body, dataDir, flowsDir, refused, runsDir } from '../flows/local.ts';

/** Every project, with its runs counted by status and the last seven days' spend. The first call seeds one. */
export async function GET(request: Request) {
  await connection(); // the list is read on every request, never at build time
  const no = refused(request);
  if (no) return no;
  seedOnce(dataDir(), flowsDir());
  return Response.json(viewProjects(readProjects(dataDir()), listRuns(runsDir()), flowsDir()));
}

const Create = z.object({
  name: z.string(),
  repoPath: z.string(),
  slug: z.string().optional(),
  defaultFlow: z.string().nullable().optional(),
  flowType: z.string().nullable().optional(),
  checkCommand: z.string().optional(),
});

/**
 * A new project, `{ name, repoPath, slug?, defaultFlow? | flowType?, checkCommand? }`: 201, or 400/409 with why.
 * `flowType` starts the project's own flow from that one (null: an empty one); `defaultFlow` adopts one as it is.
 */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Create.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { name, repoPath, slug?, defaultFlow? or flowType?, checkCommand? }' }, { status: 400 });
  const r = createProject(dataDir(), flowsDir(), input.data);
  return r.ok ? Response.json(r.value, { status: 201 }) : Response.json({ error: r.error }, { status: r.status });
}
