import { connection } from 'next/server';
import { forgetAll, readMemories } from '../../../../../packages/cli/src/memory.ts';
import { readProjects } from '../../../../../packages/cli/src/projects.ts';
import { dataDir, refused } from '../../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

const project = (id: string) => readProjects(dataDir()).find((p) => p.id === id);

/** The project's memories, newest first; 500 with why when its file cannot be read. */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  if (!project(id)) return Response.json({ error: `no project ${id}` }, { status: 404 });
  try {
    return Response.json(readMemories(dataDir(), id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Forgets every memory of the project. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  if (!project(id)) return Response.json({ error: `no project ${id}` }, { status: 404 });
  forgetAll(dataDir(), id);
  return Response.json({ ok: true });
}
