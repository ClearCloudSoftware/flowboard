/**
 * GitHub, through the installed `gh` CLI and whoever is logged in to it, the way the Claude provider uses the
 * installed `claude` login: Lamproom keeps no token of its own. Every call runs `gh` with its arguments as a list,
 * never through a shell, and a name from a request is checked before it becomes one of them.
 */
import { execFile, spawnSync } from 'node:child_process';

export type GhStatus =
  | { state: 'connected'; login: string; accounts: string[] }
  | { state: 'missing' }
  | { state: 'signed-out' }
  | { state: 'rejected'; login: string; message: string }
  /** gh is there but can't say: too old, offline, or not answering. */
  | { state: 'error'; message: string };

/** `defaultBranch`: null for a repo with no commits. `sizeKb`: GitHub's disk usage. */
export interface GhRepo { owner: string; name: string; description: string; language: string | null; pushedAt: string; private: boolean; defaultBranch: string | null; sizeKb: number }

/** Where GitHub lets a member ask an organization to approve the GitHub CLI, the app Lamproom reaches GitHub through. */
export const GH_REQUEST_ACCESS_URL = 'https://github.com/settings/connections/applications/178c6fc778ccc68e1d6a';

/** A GitHub user or organization name: letters, digits and single hyphens, never starting with one. */
export const loginOk = (name: string) => /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(name);
const badLogin = (name: string) => `not a GitHub account name: ${name}`;

const GH_ENV = () => ({ ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' });
/** What a `gh` call said, as spawnSync reports it: `error` only when gh could not run or did not finish. */
type Ran = { status: number | null; stdout: string; stderr: string; error?: Error };
const run = (gh: string, args: string[], timeout = 30_000): Ran => spawnSync(gh, args, { encoding: 'utf8', timeout, env: GH_ENV() });
/** `run` without blocking, in the same shape: a non-zero exit is a status, not an error. */
const runAsync = (gh: string, args: string[], timeout = 30_000): Promise<Ran> =>
  new Promise((done) =>
    execFile(gh, args, { encoding: 'utf8', timeout, env: GH_ENV() }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      const ranAndExited = e && typeof e.code === 'number' && !e.killed;
      done({ status: e ? (ranAndExited ? (e.code as unknown as number) : null) : 0, stdout, stderr, ...(e && !ranAndExited && { error: e }) });
    }),
  );
/** What went wrong, in gh's words: the last line it wrote that says anything. */
const why = (r: Ran) => (r.error ? r.error.message : (r.stderr || r.stdout).trim().split('\n').filter(Boolean).at(-1) ?? `gh exited ${r.status}`);

/** GitHub turning the token down, as opposed to not being reached. */
const AUTH = /\b401\b|bad credentials|token|unauthori[sz]ed/i;

/** Who `gh` is logged in as on github.com, and every account it holds there. */
export function ghStatus(gh = 'gh', timeoutMs = 30_000): GhStatus {
  return statusOf(run(gh, STATUS, timeoutMs));
}
/** `ghStatus` without blocking: what a page's server calls. */
export async function ghStatusAsync(gh = 'gh', timeoutMs = 30_000): Promise<GhStatus> {
  return statusOf(await runAsync(gh, STATUS, timeoutMs));
}

const STATUS = ['auth', 'status', '--json', 'hosts'];
function statusOf(r: Ran): GhStatus {
  if (r.error) return (r.error as NodeJS.ErrnoException).code === 'ENOENT' ? { state: 'missing' } : { state: 'error', message: `the GitHub CLI did not answer: ${r.error.message}` };
  let hosts: { login: string; active: boolean; state: string; error?: string }[] = [];
  try {
    hosts = (JSON.parse(r.stdout) as { hosts: Record<string, typeof hosts> }).hosts['github.com'] ?? [];
  } catch {
    if (/unknown flag/.test(r.stderr)) return { state: 'error', message: 'this GitHub CLI is too old for Lamproom; update it (brew upgrade gh, or your package manager), then check again' };
    return { state: 'error', message: why(r) };
  }
  const active = hosts.find((h) => h.active);
  if (!active) return { state: 'signed-out' };
  if (active.state !== 'success') {
    const message = active.error ?? 'GitHub refused the token';
    return AUTH.test(message) || !active.error ? { state: 'rejected', login: active.login, message } : { state: 'error', message };
  }
  return { state: 'connected', login: active.login, accounts: hosts.map((h) => h.login) };
}

/** The logged-in account, then the organizations it is an active member of. */
export function ghOwners(gh = 'gh'): { ok: true; owners: string[] } | { ok: false; error: string } {
  const me = run(gh, ['api', 'user', '--jq', '.login']);
  if (me.error || me.status !== 0) return { ok: false, error: why(me) };
  const orgs = run(gh, ['api', 'user/memberships/orgs?state=active', '--paginate', '--jq', '.[].organization.login']);
  if (orgs.error || orgs.status !== 0) return { ok: false, error: why(orgs) };
  return { ok: true, owners: [me.stdout.trim(), ...orgs.stdout.split('\n').filter(Boolean)] };
}

interface Row { name: string; description: string | null; primaryLanguage: { name: string } | null; pushedAt: string; isPrivate: boolean; defaultBranchRef: { name: string } | null; diskUsage: number | null }

/**
 * The owner's repositories the account can read. `restricted`: an organization that limits OAuth apps, so GitHub
 * refuses gh until an owner approves it there.
 */
// ponytail: the first 1000 repos; an owner with more needs a search box that asks GitHub, not a filter over a list
export function ghRepos(owner: string, gh = 'gh'): { ok: true; repos: GhRepo[] } | { ok: false; reason: 'restricted' | 'error'; error: string } {
  if (!loginOk(owner)) return { ok: false, reason: 'error', error: badLogin(owner) };
  const r = run(gh, ['repo', 'list', owner, '--limit', '1000', '--json', 'name,description,primaryLanguage,pushedAt,isPrivate,defaultBranchRef,diskUsage']);
  if (r.error || r.status !== 0) {
    const error = why(r);
    return { ok: false, reason: /OAuth App access restrictions/i.test(error) ? 'restricted' : 'error', error };
  }
  return {
    ok: true,
    repos: (JSON.parse(r.stdout) as Row[]).map((x) => ({
      owner,
      name: x.name,
      description: x.description ?? '',
      language: x.primaryLanguage?.name ?? null,
      pushedAt: x.pushedAt,
      private: x.isPrivate,
      defaultBranch: x.defaultBranchRef?.name ?? null,
      sizeKb: x.diskUsage ?? 0,
    })),
  };
}

/** Makes another account gh already holds for github.com the active one. */
export function ghSwitch(login: string, gh = 'gh'): { ok: true } | { ok: false; error: string } {
  if (!loginOk(login)) return { ok: false, error: badLogin(login) };
  const r = run(gh, ['auth', 'switch', '--hostname', 'github.com', '--user', login]);
  return r.error || r.status !== 0 ? { ok: false, error: why(r) } : { ok: true };
}
