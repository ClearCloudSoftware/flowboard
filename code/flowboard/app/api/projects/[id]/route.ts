import { z } from 'zod';
import { listRuns } from '../../../../packages/cli/src/flow-logs.ts';
import { owns, readProjects, removeProject, updateProject } from '../../../../packages/cli/src/projects.ts';
import { body, dataDir, flowsDir, refused, runsDir } from '../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };
/** A run with a host still at it (the runs page's LIVE); a paused run can be resumed under any project. */
const LIVE = new Set(['starting', 'running', 'waiting']);

const Edit = z.object({ name: z.string().optional(), defaultFlow: z.string().nullable().optional(), checkCommand: z.string().nullable().optional(), baseBranch: z.string().nullable().optional() });

/** `{ name?, defaultFlow?, checkCommand?, baseBranch? }`; a null check command removes it from the repo's `.flowboard.yaml`. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  const input = Edit.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { name?, defaultFlow?, checkCommand?, baseBranch? }' }, { status: 400 });
  const r = updateProject(dataDir(), flowsDir(), id, input.data);
  return r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: r.status });
}

/** Forgets the project, never while one of its runs is going; the repo and the runs stay. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  const project = readProjects(dataDir()).find((p) => p.id === id);
  if (!project) return Response.json({ error: 'no such project' }, { status: 404 });
  const live = listRuns(runsDir()).filter((r) => LIVE.has(r.status) && owns(project, r.folder));
  if (live.length) return Response.json({ error: `${live.length} of its runs ${live.length === 1 ? 'is' : 'are'} still going; stop ${live.length === 1 ? 'it' : 'them'} first` }, { status: 409 });
  removeProject(dataDir(), id);
  return Response.json({ ok: true });
}
