import { stopRun } from '../../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../../flows/local.ts';

/** Asks the run's host to stop, as one Ctrl+C would; `--resume` continues it. */
export async function POST(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const why = stopRun(runsDir(), run);
  return why ? Response.json({ error: why }, { status: 409 }) : Response.json({ ok: true });
}
