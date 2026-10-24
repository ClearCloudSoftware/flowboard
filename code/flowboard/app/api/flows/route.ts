import { relative } from 'node:path';
import { connection } from 'next/server';
import { z } from 'zod';
import { createFlow, FLOW_NAME, listFlows } from '../../../packages/cli/src/flow-files.ts';
import { body, flowsDir, refused } from './local.ts';

/** The library: every recipe in the flows folder. */
export async function GET(request: Request) {
  await connection(); // the folder is read on every request, never at build time
  const no = refused(request);
  if (no) return no;
  const dir = flowsDir();
  const rel = relative(process.cwd(), dir);
  return Response.json({ dir: rel.startsWith('..') ? dir : rel || '.', flows: listFlows(dir) });
}

const Create = z.object({ name: z.string().regex(FLOW_NAME, 'a flow name may only use lowercase letters, digits, - and _') });

/** A new recipe, `{ name }`; never over an existing one. */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Create.safeParse(await body(request));
  if (!input.success) return Response.json({ error: input.error.issues[0].message }, { status: 400 });
  const file = createFlow(flowsDir(), input.data.name);
  if (!file) return Response.json({ error: `${input.data.name}.yaml already exists` }, { status: 409 });
  return Response.json(file, { status: 201 });
}
