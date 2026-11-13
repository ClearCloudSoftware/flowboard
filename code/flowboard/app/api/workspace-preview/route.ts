import { preview } from '../../../packages/cli/src/workspace-git.ts';
import { refused, runsDir } from '../flows/local.ts';

/** What starting a run in `?folder=` would do, in task workspace `?id=` or, without one, in the folder itself. */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  return Response.json(preview(q.get('folder') ?? '', (q.get('id') ?? '').trim(), runsDir()));
}
