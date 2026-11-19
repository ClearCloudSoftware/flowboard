import { connection } from 'next/server';
import { runDoctor } from '../../../packages/cli/src/doctor.ts';
import { dataDir, flowsDir, refused } from '../flows/local.ts';

/**
 * The doctor's report on this machine, checked in the app's own environment and folders: what `pnpm lr-doctor --json`
 * prints, but as the app sees it (its PATH, its env, so its CLAUDE_CODE_OAUTH_TOKEN). Read-only but for Ollama's cache.
 */
export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  await connection();
  try {
    return Response.json(await runDoctor({ runner: 'app', dataDir: dataDir(), flowsDir: flowsDir() }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
