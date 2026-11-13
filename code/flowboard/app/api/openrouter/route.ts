import { connection } from 'next/server';
import { readAppSettings } from '../../../packages/cli/src/app-settings.ts';
import { CATALOGUE_MAX_AGE_MS, keyView, refreshCatalogue } from '../../../packages/cli/src/openrouter.ts';
import { isFree, modelProblem } from '../../../packages/cli/src/settings.ts';
import { dataDir, refused } from '../flows/local.ts';

/**
 * OpenRouter as the pages need it: which key runs would use (never the key), its model list (fetched again when an
 * hour old, or now with `?refresh=1`), and each approved model with what stops a step running on it, if anything.
 */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const fresh = new URL(request.url).searchParams.get('refresh') === '1';
  const { catalogue, error } = await refreshCatalogue(dataDir(), fresh ? 0 : CATALOGUE_MAX_AGE_MS);
  const approved = readAppSettings(dataDir()).opencodeModels;
  return Response.json({
    key: keyView(dataDir()),
    catalogue,
    ...(error && { error }),
    approved: approved.map((m) => ({ ...m, free: isFree(m.id, approved, catalogue), problem: modelProblem(m.id, approved, catalogue) ?? null })),
  });
}
