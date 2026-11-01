import { z } from 'zod';
import { readPrompt, writePrompt } from '../../../packages/cli/src/flow-files.ts';
import { body, flowsDir, refused } from '../flows/local.ts';

/** A step's prompt file, `?path=` relative to the flows folder: its text, and a version to save over (null: not there yet). */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const file = readPrompt(flowsDir(), path);
  return file ? Response.json(file) : Response.json({ error: `${path}: a prompt must be a file inside the flows folder` }, { status: 400 });
}

const Save = z.object({ path: z.string(), text: z.string(), version: z.string().nullable() });

/** Saves `{ path, text, version }`: 409 if the file changed since it was opened, 400 if the path leads outside the folder. */
export async function PUT(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Save.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { path, text, version }' }, { status: 400 });
  const saved = writePrompt(flowsDir(), input.data.path, input.data.text, input.data.version);
  if (saved.ok) return Response.json(saved.file);
  if ('conflict' in saved) return Response.json({ error: saved.conflict }, { status: 409 });
  return Response.json({ error: saved.refused }, { status: 400 });
}
