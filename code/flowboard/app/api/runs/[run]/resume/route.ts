import { join } from 'node:path';
import { z } from 'zod';
import { readRun } from '../../../../../packages/cli/src/flow-logs.ts';
import { resumeRun } from '../../../../../packages/cli/src/flow-start.ts';
import { body, dataDir, refused, runsDir } from '../../../flows/local.ts';

const Resume = z.object({ budgetUsd: z.number().min(0).optional() });

/**
 * Continues a paused run: `run-flow --resume <run> --page`, with `--budget-usd` when given, in the background.
 * Its own output goes to `<run>/resume.log`; the page follows it from the run's files like any other host. 422 with
 * run-flow's words if it refuses.
 */
export async function POST(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const input = Resume.safeParse((await body(request)) ?? {});
  if (!input.success) return Response.json({ error: 'send { budgetUsd? }, a number of dollars' }, { status: 400 });
  const detail = readRun(runsDir(), run);
  if (!detail) return Response.json({ error: `no run ${run}` }, { status: 404 });
  if (detail.status !== 'paused') return Response.json({ error: `the run is ${detail.status}; only a paused run resumes` }, { status: 409 });
  const r = await resumeRun(join(runsDir(), run), dataDir(), input.data.budgetUsd);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 422 });
}
