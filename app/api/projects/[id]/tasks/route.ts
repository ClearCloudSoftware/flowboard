import { readProjects } from '../../../../../packages/cli/src/projects.ts';
import { readTasks } from '../../../../../packages/cli/src/tasks.ts';
import { dataDir, refused } from '../../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

/** The project's tasks, in the order they were made. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  if (!readProjects(dataDir()).some((p) => p.id === id)) return Response.json({ error: `no project ${id}` }, { status: 404 });
  return Response.json(await readTasks(dataDir(), id));
}
