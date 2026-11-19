import { readLogs } from '../../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../../flows/local.ts';

/** Every step log of one run, a parsed line per event. */
export async function GET(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const logs = readLogs(runsDir(), run);
  return logs ? Response.json(logs) : Response.json({ error: `no run ${run}` }, { status: 404 });
}
