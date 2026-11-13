/** The app's settings file: `settings.json` in FlowBoard's data folder. The model is `settings.ts`. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isFile, writeJsonFile } from './config.ts';
import type { Result } from './projects.ts';
import { APP_DEFAULTS, type AppSettings, AppSettingsSchema } from './settings.ts';

const fileOf = (dataDir: string) => join(dataDir, 'settings.json');

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
  writeJsonFile(fileOf(dataDir), next);
  return { ok: true, value: next };
}

