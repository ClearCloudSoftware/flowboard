import { startKnowledgeBuild } from '../../../../../packages/cli/src/knowledge-run.ts';
import { readProjects } from '../../../../../packages/cli/src/projects.ts';
import { dataDir, refused, runsDir } from '../../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

/** Builds the project's knowledge assets now: `{ run }`, or 422 with lr-run-flow's words when it refuses. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  const project = readProjects(dataDir()).find((p) => p.id === id);
  if (!project) return Response.json({ error: `no project ${id}` }, { status: 404 });
  const r = await startKnowledgeBuild(dataDir(), runsDir(), project);
  return r.ok ? Response.json({ run: r.run }) : Response.json({ error: r.error }, { status: 422 });
}
