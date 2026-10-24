import { z } from 'zod';
import { draftFlow } from '../../../../../packages/cli/src/flow-files.ts';
import { badName, body, flowsDir, refused } from '../../local.ts';

/** The live check: what saving the posted draft would write, and what `--check` says of it. Writes nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const no = refused(request) ?? badName(name);
  if (no) return no;
  const draft = z.record(z.string(), z.unknown()).safeParse(await body(request));
  if (!draft.success) return Response.json({ error: 'send the draft as a JSON object' }, { status: 400 });
  const out = draftFlow(flowsDir(), name, draft.data);
  return out ? Response.json(out) : Response.json({ error: `no ${name}.yaml in the flows folder` }, { status: 404 });
}
