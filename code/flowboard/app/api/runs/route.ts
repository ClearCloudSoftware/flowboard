import { z } from 'zod';
import { listRuns } from '../../../packages/cli/src/flow-logs.ts';
import { startRun } from '../../../packages/cli/src/flow-start.ts';
import { body, dataDir, flowsDir, refused, runsDir } from '../flows/local.ts';

/** The run folders, newest first; `?flow=` keeps the runs of that flow. */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  const flow = new URL(request.url).searchParams.get('flow');
  const runs = listRuns(runsDir());
  return Response.json(flow ? runs.filter((r) => r.flow === flow) : runs);
}

const Start = z.object({ flow: z.string(), folder: z.string(), task: z.string(), budgetUsd: z.number().min(0).optional(), allowDirty: z.boolean().optional(), workspace: z.string().optional() });

/** Starts a run of a flow in the library: `run-flow --page` in the background. 422 with run-flow's words if it refuses. */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Start.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { flow, folder, task, budgetUsd?, allowDirty?, workspace? }' }, { status: 400 });
  const r = await startRun(runsDir(), flowsDir(), input.data, dataDir());
  return r.ok ? Response.json({ name: r.name }) : Response.json({ error: r.error }, { status: 422 });
}
