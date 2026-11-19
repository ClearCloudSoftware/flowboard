import type { ChildProcess } from 'node:child_process';

/** Default grace between SIGTERM and SIGKILL. */
export const KILL_GRACE_MS = 5000;

/** SIGTERM now; SIGKILL after `graceMs` if the child has not exited, so a stuck CLI cannot hang a run. */
export function terminate(child: ChildProcess, graceMs = KILL_GRACE_MS): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, graceMs);
  timer.unref(); // never keeps Node alive on its own
  child.once('exit', () => clearTimeout(timer));
}
