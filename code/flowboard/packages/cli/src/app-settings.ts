/** The app's settings file: `settings.json` in FlowBoard's data folder. The model is `settings.ts`. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFile, writeJsonFile } from './config.ts';
import type { Result } from './projects.ts';
import { APP_DEFAULTS, type AppSettings, AppSettingsSchema, MODELS_PAGE } from './settings.ts';

const fileOf = (dataDir: string) => join(dataDir, 'settings.json');

/** FlowBoard's data folder for the CLIs: `FLOWBOARD_DATA_DIR`, else `data/` in the app's folder, as the app has it. */
export const defaultDataDir = () =>
  process.env.FLOWBOARD_DATA_DIR ? resolve(process.env.FLOWBOARD_DATA_DIR) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../data');

/** The app's settings: the defaults, with what `settings.json` sets over them. */
export function readAppSettings(dataDir: string): AppSettings {
  const file = fileOf(dataDir);
  if (!isFile(file)) return APP_DEFAULTS;
  // ponytail: a file that does not pass is ignored, as only this module writes it; say so on /settings if hand edits appear
  const r = AppSettingsSchema.partial().safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return r.success ? { ...APP_DEFAULTS, ...r.data } : APP_DEFAULTS;
}

/** Sets the keys given; a key holding an object is replaced whole. 400 with the first rule broken. */
export function updateAppSettings(dataDir: string, edit: Partial<AppSettings>): Result<AppSettings> {
  const r = AppSettingsSchema.partial().safeParse(edit);
  if (!r.success) return { ok: false, status: 400, error: r.error.issues[0].message };
  const next = { ...readAppSettings(dataDir), ...r.data };
  // An OpenCode model set here must be approved; withdrawing an approval later is allowed, and runs then refuse it.
  const approved = new Set(next.opencodeModels.map((m) => m.id));
  const models = [...(r.data.agents?.opencode.model ? [r.data.agents.opencode.model] : []), ...Object.values(r.data.internal ?? {}).flatMap((c) => (c.adapter === 'opencode' ? [c.model] : []))];
  const unapproved = models.find((m) => !approved.has(m));
  if (unapproved) return { ok: false, status: 400, error: `${unapproved} is not an approved model; approve it in ${MODELS_PAGE}` };
  writeJsonFile(fileOf(dataDir), next);
  return { ok: true, value: next };
}

