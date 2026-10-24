import { spawn } from 'node:child_process';
import type { ExecHost, SandboxProfile } from '@flowboard/core';

/** The uid:gid a non-root container runs as. */
export const SANDBOX_USER = '1000:1000';

/**
 * `docker run` arguments for one process in a throwaway container: `cwd` is mounted at the same path, so paths
 * mean the same inside and out; env is passed by name (`-e K`), so values never show in the process list.
 */
export function dockerArgs(profile: SandboxProfile, command: string, args: string[], cwd: string, envNames: string[], ports: number[] = []): string[] {
  if (!profile.image) throw new Error('sandbox: no image');
  // ponytail: no egress proxy yet, so the network is none or open; an allowlist needs the proxy (Sandboxing Roadmap)
  const open = profile.egressAllow.length === 1 && profile.egressAllow[0] === '*';
  if (profile.egressAllow.length && !open) throw new Error("sandbox: egressAllow needs the egress proxy, which is not built; use [] or ['*']");
  const l = profile.limits ?? {};
  return [
    'run', '--rm', '-i', '--init', '--label', 'flowboard=sandbox',
    ...(open ? [] : ['--network', 'none']),
    ...ports.flatMap((p) => ['-p', `127.0.0.1:${p}:${p}`]),
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only', '--tmpfs', '/tmp',
    ...(profile.nonRoot === false ? [] : ['--user', SANDBOX_USER, '-e', 'HOME=/tmp']),
    '--pids-limit', String(l.pids ?? 512),
    ...(l.memoryMb ? ['--memory', `${l.memoryMb}m`] : []),
    ...(l.cpus ? ['--cpus', String(l.cpus)] : []),
    '-v', `${cwd}:${cwd}`, '-w', cwd,
    ...(profile.mounts ?? []).flatMap((m) => ['-v', `${m.source}:${m.target}${m.readOnly ? ':ro' : ''}`]),
    ...envNames.flatMap((k) => ['-e', k]),
    '--entrypoint', command, // the image's own entrypoint would take `command` as its arguments
    profile.image,
    ...args,
  ];
}

/**
 * The `container` tier: each spawn is a `docker run --rm` that ends with the process. Stopping the `docker`
 * client stops the container, and everything the process started goes with it.
 * Only env the caller set on top of this process's env goes in (plus `profile.env`): the host's PATH and HOME
 * mean nothing inside the image.
 */
export function dockerExecHost(profile: SandboxProfile, opts: { tmpDir?: string; docker?: string } = {}): ExecHost {
  const { tmpDir, docker = 'docker' } = opts;
  const withTmp = tmpDir ? { ...profile, mounts: [...(profile.mounts ?? []), { source: tmpDir, target: tmpDir }] } : profile;
  return {
    id: 'container',
    profile,
    ...(tmpDir && { tmpDir }),
    spawn(command, args, { cwd, env = process.env, ports }) {
      const extra = { ...Object.fromEntries(Object.entries(env).filter(([k, v]) => process.env[k] !== v)), ...profile.env };
      return spawn(docker, dockerArgs(withTmp, command, args, cwd, Object.keys(extra), ports), {
        env: { ...process.env, ...extra },
        stdio: 'pipe',
      });
    },
  };
}
