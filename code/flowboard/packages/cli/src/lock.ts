/** run-flow's folder lock, as other readers see it: `<folder>/.flowboard/lock` holds the pid of the run-flow working there. */
import { readFileSync } from 'node:fs';

/** The pid of the live run-flow holding the lock at `path`; undefined when there is none. */
export function heldBy(path: string): number | undefined {
  const held = readLock(path);
  return held && typeof held.pid === 'number' && alive(held.pid) ? held.pid : undefined;
}

/** False when `pid` names no process. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // there, but not ours to signal
  }
}

/** The lock's content; undefined when there is no lock, null when it cannot be read. */
export function readLock(path: string): { pid?: unknown; runDir?: unknown } | null | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null;
  }
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null ? v : null;
  } catch {
    return null;
  }
}
