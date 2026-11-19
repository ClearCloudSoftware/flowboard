/**
 * The credentials Lamproom keeps: `secrets.json` in its data folder, apart from `settings.json` so no page ever reads
 * it, owner-only where the OS has file modes. One key per credential; setting or removing one keeps the others.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isFile, writeJsonFile } from './config.ts';

/** An environment variable name that holds a credential: shell steps run without these (`flow-exec.ts`). */
export const SECRET_NAME = /_(KEY|TOKEN|SECRET|PASSWORD)$/i;
/**
 * Text that looks like it holds a credential: a name like SECRET_NAME's, a word like password followed by `:` or `=`,
 * a known token's prefix (OpenAI and OpenRouter, Slack, GitHub, AWS, Google), or a private key's armour.
 */
// ponytail: a few known shapes, not entropy scanning; a secret of another shape still gets through
const SECRET_TEXT = new RegExp(
  [
    `\\w${SECRET_NAME.source.replace('$', '\\b')}`,
    '\\b(password|passwd|passphrase|token|secret|api[ _-]?key)\\s*[:=]',
    '\\b(sk-[\\w-]{16,}|xox[abpr]-\\S+|xapp-\\S+|gh[pousr]_\\w{20,}|github_pat_\\w+|AKIA[0-9A-Z]{16}|AIza[\\w-]{30,})',
    '-----BEGIN [A-Z ]*PRIVATE KEY',
  ].join('|'),
  'i',
);
export const looksSecret = (text: string) => SECRET_TEXT.test(text);

/** `openrouter`: OpenCode's key; `slackBot` (`xoxb-`) and `slackApp` (`xapp-`, Socket Mode): Slack escalation's. */
export type SecretName = 'openrouter' | 'slackBot' | 'slackApp';

const fileOf = (dataDir: string) => join(dataDir, 'secrets.json');
const readAll = (dataDir: string): Record<string, unknown> => {
  try {
    const s = isFile(fileOf(dataDir)) ? JSON.parse(readFileSync(fileOf(dataDir), 'utf8')) : {};
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch {
    return {}; // ponytail: a file that does not parse counts as empty; only this module writes it
  }
};

export function readSecret(dataDir: string, name: SecretName): string | undefined {
  const v = readAll(dataDir)[name];
  return typeof v === 'string' ? v : undefined;
}

/** Sets `name`, or deletes it for null; the file goes once nothing is left in it. */
export function setSecret(dataDir: string, name: SecretName, value: string | null): void {
  const all = readAll(dataDir);
  if (value === null) delete all[name];
  else all[name] = value;
  if (Object.keys(all).length) writeJsonFile(fileOf(dataDir), all, 0o600);
  else rmSync(fileOf(dataDir), { force: true });
}
