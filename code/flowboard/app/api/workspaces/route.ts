import { listWorkspaces, openRepo } from '../../../packages/cli/src/workspace-git.ts';
import { refused, runsDir } from '../flows/local.ts';

/** Every task workspace in the repo `?folder=` is in, and the repo itself: its top folder, base branch and tip. */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  const repo = openRepo(new URL(request.url).searchParams.get('folder') ?? '');
  if ('error' in repo) return Response.json({ error: repo.error }, { status: 422 });
  return Response.json({ repo, rows: listWorkspaces(repo, runsDir()) });
}
