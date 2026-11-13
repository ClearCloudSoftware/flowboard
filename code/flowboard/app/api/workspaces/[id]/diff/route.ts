import { diffOf } from '../../../../../packages/cli/src/workspace-git.ts';
import { dataDir, refused } from '../../../flows/local.ts';

/** The task branch's diff against the base, or with `?commit=` that one commit's, file by file. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;
  const q = new URL(request.url).searchParams;
  const files = diffOf(q.get('folder') ?? '', id, dataDir(), q.get('commit') ?? undefined);
  return 'error' in files ? Response.json({ error: files.error }, { status: 422 }) : Response.json(files);
}
