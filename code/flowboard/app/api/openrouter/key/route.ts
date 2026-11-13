import { z } from 'zod';
import { KEY_VAR, keyView, removeKey, saveKey, savedKey, testKey } from '../../../../packages/cli/src/openrouter.ts';
import { body, dataDir, refused } from '../../flows/local.ts';

const Key = z.object({ key: z.string() });

/** Saves `{ key }` for OpenCode's runs; answers with which key runs would use, never the key. */
export async function PUT(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Key.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { key }' }, { status: 400 });
  const r = saveKey(dataDir(), input.data.key);
  return r.ok ? Response.json(keyView(dataDir())) : Response.json({ error: r.error }, { status: 400 });
}

/** Forgets the saved key; an exported one still counts. */
export async function DELETE(request: Request) {
  const no = refused(request);
  if (no) return no;
  removeKey(dataDir());
  return Response.json(keyView(dataDir()));
}

/** Asks OpenRouter about the key runs would use: its name, credit limit and spend. */
export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const key = process.env[KEY_VAR] || savedKey(dataDir());
  if (!key) return Response.json({ error: 'no key saved' }, { status: 400 });
  return Response.json(await testKey(key));
}
