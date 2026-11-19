// The PATH Lamproom's server and runs need. An app opened from Finder gets launchd's bare PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), so `node`, `claude`, `gh`, `git` and `docker` go missing; one opened from
// Explorer gets Explorer's PATH, which misses whatever was installed since you logged in.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const MARK = '__LAMPROOM_PATH__';
const TIMEOUT_MS = 10_000; // a slow or stuck shell profile must not stop the app starting

/** Your terminal's PATH: a login, interactive shell (so .zprofile, .zshrc and nvm run), or on Windows the registry's. */
export function shellPath(platform = process.platform, env = process.env) {
  try {
    if (platform === 'win32') {
      const script = "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env, encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true }).trim();
    }
    // The marks keep anything a profile prints (a greeting, a prompt) out of what is read.
    const out = execFileSync(env.SHELL || '/bin/sh', ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { env, encoding: 'utf8', timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(MARK)[1] ?? '';
  } catch {
    return '';
  }
}

/** Where the tools usually live when the shell gives nothing; only folders that exist are added. */
export function fallbackFolders(platform = process.platform, env = process.env, home = homedir()) {
  const { join } = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    return [
      join(pf, 'nodejs'), // the Node installer, and nvm-windows' link
      join(pf, 'Git', 'cmd'),
      join(pf, 'GitHub CLI'),
      join(pf, 'Docker', 'Docker', 'resources', 'bin'),
      join(home, '.local', 'bin'), // Claude Code's installer
      env.APPDATA && join(env.APPDATA, 'npm'), // npm -g
      join(home, 'scoop', 'shims'),
      join(env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'),
    ].filter(Boolean);
  }
  // ponytail: no nvm folder here; its path names the Node version. The shell finds it; bundle Node when packaging.
  return ['/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'), join(home, '.opencode', 'bin'), join(home, '.docker', 'bin')];
}

/** The parts joined in order with repeats and blanks dropped: the first one found wins, as on a PATH. */
export function mergePath(parts, sep = path.delimiter) {
  return [...new Set(parts.flatMap((p) => (p ? p.split(sep) : [])).filter(Boolean))].join(sep);
}

/** Your shell's PATH first, then the one the app was given, then the usual folders that exist. */
export function fullPath(platform = process.platform, env = process.env) {
  const sep = platform === 'win32' ? ';' : ':';
  return mergePath([shellPath(platform, env), env.PATH, ...fallbackFolders(platform, env).filter((d) => existsSync(d))], sep);
}
