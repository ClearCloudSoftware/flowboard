import { z } from 'zod';
import { importBacklog } from '../../../../../../packages/cli/src/backlog-import.ts';
import { readProjects } from '../../../../../../packages/cli/src/projects.ts';
import { body, dataDir, refused, runsDir } from '../../../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

const Input = z.strictObject({ content: z.string().optional(), path: z.string().min(1).optional() });

/**
 * Imports a markdown backlog, `{ content }` or `{ path }` (a file in the repo): `{ run }`, the backlog importer
 * reading it (poll `import/<run>`), or `{ imported }` with the parser's counts when that run could not start.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const no = refused(request);
  if (no) return no;
  const input = Input.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { content } or { path }' }, { status: 400 });
  const project = readProjects(dataDir()).find((p) => p.id === id);
  if (!project) return Response.json({ error: `no project ${id}` }, { status: 404 });
  const r = await importBacklog(dataDir(), runsDir(), project, input.data);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json('run' in r ? { run: r.run } : { imported: r.imported });
}
