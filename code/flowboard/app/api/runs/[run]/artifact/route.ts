import { readArtifact } from '../../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../../flows/local.ts';

/** One artifact of the run, `?type=`, as text. */
export async function GET(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const text = readArtifact(runsDir(), run, new URL(request.url).searchParams.get('type') ?? '');
  return text === undefined ? Response.json({ error: 'no such artifact in this run' }, { status: 404 }) : Response.json({ text });
}
