import { z } from 'zod';
import { readFlow, saveFlow } from '../../../../packages/cli/src/flow-files.ts';
import { badName, body, flowsDir, refused } from '../local.ts';

type Params = { params: Promise<{ name: string }> };

/** One recipe: its text, its version, what it parses to, and what `--check` says of it. */
export async function GET(request: Request, { params }: Params) {
  const { name } = await params;
  const no = refused(request) ?? badName(name);
  if (no) return no;
  const file = readFlow(flowsDir(), name);
  return file ? Response.json(file) : Response.json({ error: `no ${name}.yaml in the flows folder` }, { status: 404 });
}

const Save = z.object({ draft: z.record(z.string(), z.unknown()), version: z.string() });

/** Saves `{ draft, version }` over the recipe opened at `version`: 409 if it changed since, 422 if the check refuses it. */
export async function PUT(request: Request, { params }: Params) {
  const { name } = await params;
  const no = refused(request) ?? badName(name);
  if (no) return no;
  const input = Save.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { draft, version }' }, { status: 400 });
  const saved = saveFlow(flowsDir(), name, input.data.draft, input.data.version);
  if (saved.ok) return Response.json(saved.file);
  if ('conflict' in saved) return Response.json({ error: saved.conflict }, { status: 409 });
  return Response.json({ error: 'not saved: the recipe does not pass the check', check: saved.check }, { status: 422 });
}
