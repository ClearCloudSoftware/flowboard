import { spawn } from 'node:child_process';
import type { ExecHost } from '@flowboard/core';

/** The `host` tier: a plain child process on this machine, no sandbox. */
export const hostExecHost: ExecHost = {
  id: 'host',
  spawn: (command, args, { cwd, env }) => spawn(command, args, { cwd, env, stdio: 'pipe' }),
};
