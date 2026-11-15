import { forgetMemory } from '../../../../../../packages/cli/src/memory.ts';
import { readProjects } from '../../../../../../packages/cli/src/projects.ts';
import { dataDir, refused } from '../../../../flows/local.ts';

type Params = { params: Promise<{ id: string; memoryId: string }> };

/** Forgets one memory of the project: 404 when the project or the memory is not there. */
export async function DELETE(request: Request, { params }: Params) {
  const { id, memoryId } = await params;
  const no = refused(request);
  if (no) return no;
  if (!readProjects(dataDir()).some((p) => p.id === id)) return Response.json({ error: `no project ${id}` }, { status: 404 });
  try {
    return forgetMemory(dataDir(), id, memoryId) ? Response.json({ ok: true }) : Response.json({ error: 'no such memory; it may be forgotten already' }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
