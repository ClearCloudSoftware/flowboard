import { connection } from 'next/server';
import { ghRepos, loginOk } from '../../../../packages/cli/src/github.ts';
import { readProjects } from '../../../../packages/cli/src/projects.ts';
import { dataDir, refused } from '../../flows/local.ts';

/**
 * `?owner=`: the owner's repositories, `{ ok, repos }` or `{ ok: false, reason: 'restricted' | 'error', error }`, with
 * `taken`: `owner/name` → the project already cloned from it.
 */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const owner = new URL(request.url).searchParams.get('owner') ?? '';
  if (!loginOk(owner)) return Response.json({ error: `not a GitHub account name: ${owner}` }, { status: 400 });
  const taken = Object.fromEntries(readProjects(dataDir()).flatMap((p) => (p.source.kind === 'github' ? [[p.source.repo, p.name]] : [])));
  return Response.json({ ...ghRepos(owner), taken });
}
