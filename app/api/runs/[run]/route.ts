import { readRun } from '../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../flows/local.ts';

/** One run as the run page shows it: its steps, spend, artifacts, patch and open questions. */
export async function GET(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const detail = readRun(runsDir(), run);
  return detail ? Response.json(detail) : Response.json({ error: `no run ${run}` }, { status: 404 });
}
