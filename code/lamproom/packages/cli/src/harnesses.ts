/**
 * What this machine's agent CLIs say about themselves: whether each is installed, its version, and the login it would
 * run on. Each call runs the CLI with its arguments as a list, never through a shell.
 */
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { HARNESSES, type Harness } from './settings.ts';

/** `signIn.ok`: the CLI has a login it can run on; `text`: which, or what is wrong, in a line. */
export type HarnessStatus = { program: string } & ({ installed: false; error?: string } | { installed: true; version: string; signIn: { ok: boolean; text: string } });

const exec = promisify(execFile);
const home = (p: string) => (p.startsWith('~/') ? homedir() + p.slice(1) : p);
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** `claude auth status`'s JSON, as a line. */
export function claudeSignIn(json: string): { ok: boolean; text: string } {
  const s = JSON.parse(json) as { loggedIn?: boolean; authMethod?: string; email?: string };
  if (!s.loggedIn) return { ok: false, text: 'not logged in: run claude in a terminal and log in' };
  return { ok: true, text: s.authMethod === 'claude.ai' ? 'logged in with a Claude subscription' : `logged in (${s.authMethod ?? 'unknown method'})` };
}

/** `opencode auth list`'s credential lines (`●  OpenRouter api`), as a line. */
export function opencodeSignIn(out: string): { ok: boolean; text: string } {
  const creds = [...plain(out).matchAll(/^●\s+(.+?)\s+(\S+)\s*$/gm)].map((m) => `${m[1]} (${m[2]})`);
  return creds.length ? { ok: true, text: `credentials for ${creds.join(', ')}` } : { ok: false, text: 'no credentials: run opencode auth login in a terminal' };
}

const SIGN_IN: Record<Harness, { args: string[]; parse: (out: string) => { ok: boolean; text: string } }> = {
  'claude-code': { args: ['auth', 'status'], parse: claudeSignIn },
  opencode: { args: ['auth', 'list'], parse: opencodeSignIn },
};

/** One harness, run from `path` (null for its name on PATH). */
export async function harnessStatus(id: Harness, path: string | null): Promise<HarnessStatus> {
  const program = path ?? HARNESSES[id].bin;
  const run = (args: string[]) => exec(home(program), args, { timeout: 20_000, env: { ...process.env, NO_COLOR: '1' } });
  let version: string;
  try {
    version = (await run(['--version'])).stdout.trim().split(/\s/)[0];
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return err.code === 'ENOENT' ? { program, installed: false } : { program, installed: false, error: err.message };
  }
  try {
    const r = await run(SIGN_IN[id].args);
    return { program, installed: true, version, signIn: SIGN_IN[id].parse(r.stdout) };
  } catch (e) {
    // `claude auth status` exits 1 when logged out, still printing its JSON.
    const out = (e as { stdout?: string }).stdout;
    try {
      if (out) return { program, installed: true, version, signIn: SIGN_IN[id].parse(out) };
    } catch {}
    return { program, installed: true, version, signIn: { ok: false, text: `could not tell: ${(e as Error).message.split('\n')[0]}` } };
  }
}
