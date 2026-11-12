import { connection } from 'next/server';
import { z } from 'zod';
import { cloneTarget, startClone } from '../../../../packages/cli/src/clone.ts';
import type { Overrides } from '../../../../packages/cli/src/settings.ts';
import { FOLDER, FOLDER_RE } from '../../../../packages/cli/src/settings.ts';
import { body, dataDir, flowsDir, refused } from '../../flows/local.ts';

/** `?parent=&name=`: the folder a clone of `name` would go to, `{ folder }`, numbered past one that holds something. */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  const parent = q.get('parent') ?? '';
  const name = q.get('name') ?? '';
  if (!FOLDER_RE.test(parent.trim())) return Response.json({ error: FOLDER }, { status: 400 });
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return Response.json({ error: 'send ?parent=&name=' }, { status: 400 });
  return Response.json({ folder: cloneTarget(parent, name) });
}

/** The shape only; `startClone` checks the values and says what is wrong with them. */
const Clone = z.object({
  repo: z.string(),
  type: z.enum(['software', 'research', 'writing', 'data']),
  parent: z.string(),
  makeDefault: z.boolean(),
  overrides: z.record(z.string(), z.unknown()),
  limits: z.object({ memoryMb: z.number().optional(), cpus: z.number().optional() }),
});

/** `{ repo, type, parent, makeDefault, overrides, limits }`: 201 with the clone job, or 400/409 with why. */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Clone.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { repo, type, parent, makeDefault, overrides, limits }' }, { status: 400 });
  const r = startClone(dataDir(), flowsDir(), { ...input.data, overrides: input.data.overrides as Overrides });
  return r.ok ? Response.json(r.value, { status: 201 }) : Response.json({ error: r.error }, { status: r.status });
}
