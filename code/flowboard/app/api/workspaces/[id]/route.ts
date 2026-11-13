import { z } from 'zod';
import { dryRun, land, openRepo, removeWorkspace, review, updateFromBase } from '../../../../packages/cli/src/workspace-git.ts';
import { body, dataDir, refused, runsDir } from '../../flows/local.ts';

/** One task's branch against the base: its commits, the base's since the cut, and the files both changed. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;
  const r = review(new URL(request.url).searchParams.get('folder') ?? '', id, runsDir(), dataDir());
  return 'error' in r ? Response.json({ error: r.error }, { status: 422 }) : Response.json(r);
}

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dry-run'), folder: z.string() }),
  z.object({ action: z.literal('update'), folder: z.string() }),
  z.object({ action: z.literal('land'), folder: z.string(), strategy: z.enum(['merge', 'squash', 'ff']), message: z.string() }),
  z.object({ action: z.literal('clean'), folder: z.string(), force: z.boolean().optional() }),
]);

/**
 * What the host does to a task workspace, on a person's say-so: a dry-run merge, an update from the base, landing
 * the branch, or removing the workspace. 422 with git's or clean-workspace's own words when it refuses.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;
  const input = Action.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { action: dry-run | update | land | clean, folder, … }' }, { status: 400 });
  const a = input.data;
  if (a.action === 'dry-run') return Response.json(dryRun(a.folder, id, runsDir(), dataDir()));
  const r =
    a.action === 'update' ? updateFromBase(a.folder, id, runsDir(), dataDir())
    : a.action === 'land' ? land(a.folder, id, a.strategy, a.message, runsDir(), dataDir())
    : await clean(a.folder, id, !!a.force);
  return Response.json(r, { status: r.ok ? 200 : 422 });
}

async function clean(folder: string, id: string, force: boolean) {
  const repo = openRepo(folder, dataDir());
  if ('error' in repo) return { ok: false as const, error: repo.error };
  return removeWorkspace(repo.root, repo.sub, id, force);
}
