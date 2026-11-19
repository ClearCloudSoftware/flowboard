import { agentImport } from '../../../../../../../packages/cli/src/backlog-import.ts';
import { dataDir, refused, runsDir } from '../../../../../flows/local.ts';

type Params = { params: Promise<{ id: string; run: string }> };

/** Where the importer agent's import stands: running, done with the counts (imported once), or failed. */
export async function GET(request: Request, { params }: Params) {
  const { id, run } = await params;
  const no = refused(request);
  if (no) return no;
  const r = await agentImport(dataDir(), runsDir(), id, run);
  return r ? Response.json(r) : Response.json({ error: `no import ${run} in project ${id}` }, { status: 404 });
}
