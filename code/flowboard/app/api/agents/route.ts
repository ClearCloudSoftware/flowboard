import { connection } from 'next/server';
import { readAppSettings } from '../../../packages/cli/src/app-settings.ts';
import { harnessStatus } from '../../../packages/cli/src/harnesses.ts';
import { dataDir, refused } from '../flows/local.ts';

/** Each agent CLI as this machine has it, run from the program the app's settings name: installed, version, login. */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const { agents } = readAppSettings(dataDir());
  const [claude, opencode] = await Promise.all([harnessStatus('claude-code', agents['claude-code'].path), harnessStatus('opencode', agents.opencode.path)]);
  return Response.json({ 'claude-code': claude, opencode });
}
