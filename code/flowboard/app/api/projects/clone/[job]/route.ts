import { connection } from 'next/server';
import { cloneJob } from '../../../../../packages/cli/src/clone.ts';
import { refused } from '../../../flows/local.ts';

/** A clone job as it stands; 404 for one this server never ran or forgot when it restarted. */
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const job = cloneJob((await params).job);
  return job ? Response.json(job) : Response.json({ error: 'no such clone; FlowBoard may have restarted during it' }, { status: 404 });
}
