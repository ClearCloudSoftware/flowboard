import { listRuns } from '../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../flows/local.ts';

/** The run folders, newest first; `?flow=` keeps the runs of that flow. */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  const flow = new URL(request.url).searchParams.get('flow');
  const runs = listRuns(runsDir());
  return Response.json(flow ? runs.filter((r) => r.flow === flow) : runs);
}
