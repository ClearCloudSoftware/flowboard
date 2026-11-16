import { connection } from 'next/server';
import { readAppSettings } from '../../../packages/cli/src/app-settings.ts';
import { localModels, refreshOllama } from '../../../packages/cli/src/ollama.ts';
import { CATALOGUE_MAX_AGE_MS, keyView, refreshCatalogue } from '../../../packages/cli/src/openrouter.ts';
import { isFree, modelProblem, modelWarning } from '../../../packages/cli/src/settings.ts';
import { dataDir, refused } from '../flows/local.ts';

/**
 * OpenCode's models as the pages need them: which OpenRouter key runs would use (never the key), OpenRouter's list
 * (fetched again when an hour old, or now with `?refresh=1`), Ollama on this machine (asked every time: it is
 * local), and each approved model with what stops a step running on it, and what a step on it is warned of.
 */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const fresh = new URL(request.url).searchParams.get('refresh') === '1';
  const [{ catalogue, error }, ollama] = await Promise.all([refreshCatalogue(dataDir(), fresh ? 0 : CATALOGUE_MAX_AGE_MS), refreshOllama(dataDir())]);
  const approved = readAppSettings(dataDir()).opencodeModels;
  const local = localModels(ollama);
  return Response.json({
    key: keyView(dataDir()),
    catalogue,
    ...(error && { error }),
    ollama,
    approved: approved.map((m) => ({
      ...m,
      free: isFree(m.id, approved, catalogue),
      problem: modelProblem(m.id, approved, catalogue, local) ?? null,
      warning: modelWarning(m.id, approved, catalogue, local) ?? null,
    })),
  });
}
