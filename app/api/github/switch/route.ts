import { z } from 'zod';
import { ghSwitch } from '../../../../packages/cli/src/github.ts';
import { body, refused } from '../../flows/local.ts';

/** `{ login }`: makes another account the installed `gh` already holds the active one. */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = z.object({ login: z.string() }).safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { login }' }, { status: 400 });
  const r = ghSwitch(input.data.login);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 400 });
}
