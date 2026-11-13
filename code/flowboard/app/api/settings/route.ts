import { platform } from 'node:os';
import { connection } from 'next/server';
import { readAppSettings, updateAppSettings } from '../../../packages/cli/src/app-settings.ts';
import { recentParents } from '../../../packages/cli/src/clone.ts';
import { ghStatus } from '../../../packages/cli/src/github.ts';
import { readProjects } from '../../../packages/cli/src/projects.ts';
import { DEFAULT_PROJECTS_FOLDER } from '../../../packages/cli/src/settings.ts';
import { body, dataDir, refused } from '../flows/local.ts';

/**
 * The app's settings, with what the pages need around them: this machine's OS (gVisor needs Linux), the `gh` login,
 * and the folders projects were cloned into before.
 */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const app = readAppSettings(dataDir());
  return Response.json({
    app,
    defaultFolder: DEFAULT_PROJECTS_FOLDER,
    machine: { os: platform() },
    github: ghStatus(),
    recentFolders: recentParents(readProjects(dataDir()), app.projectsFolder ?? DEFAULT_PROJECTS_FOLDER),
  });
}

/** Any of the app's settings; a key holding an object is replaced whole. 400 with the first rule broken. */
export async function PATCH(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = await body(request);
  if (!input || typeof input !== 'object') return Response.json({ error: 'send the settings to change, as JSON' }, { status: 400 });
  const r = updateAppSettings(dataDir(), input);
  return r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: r.status });
}
