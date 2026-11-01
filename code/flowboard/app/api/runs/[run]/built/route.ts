import { builtOf } from '../../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../../flows/local.ts';

/** What the run built, as a diff: its changes.patch, else the folder's uncommitted changes. */
export async function GET(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const built = builtOf(runsDir(), run);
  return built ? Response.json(built) : Response.json({ error: `no run ${run}` }, { status: 404 });
}
