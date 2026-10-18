import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ExecHost } from '@flowboard/core';

export interface StartedServer {
  url: string;
  child: ChildProcessWithoutNullStreams;
  stderrTail: () => string;
}

/** A failure to start, carrying the server's exit code when it died. */
export class ServerStartError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Spawn `opencode serve` on loopback and resolve once it prints its URL. */
export function startServer(
  exec: ExecHost,
  opts: { opencodePath: string; cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<StartedServer> {
  const { timeoutMs = 30_000 } = opts;
  const child = exec.spawn(opts.opencodePath, ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: opts.cwd, env: opts.env });
  let tail = '';
  child.stderr.on('data', (d) => (tail = (tail + d).slice(-4000)));

  return new Promise((resolve, reject) => {
    let out = '';
    const done = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('close', onClose);
      child.off('error', onError);
      child.stdout.resume(); // keep draining the pipe after the URL line
    };
    const onData = (d: Buffer) => {
      out += d;
      const m = /opencode server listening on (http:\/\/\S+)/.exec(out);
      if (m) {
        done();
        resolve({ url: m[1], child, stderrTail: () => tail });
      }
    };
    // 'close', not 'exit': stderr is fully read by then.
    const onClose = (code: number | null) => {
      done();
      reject(new ServerStartError(`opencode server exited with code ${code}: ${tail.trim()}`, code ?? 1));
    };
    const onError = (e: Error) => {
      done();
      reject(new ServerStartError(`opencode server failed to start: ${e.message}`, 127));
    };
    const timer = setTimeout(() => {
      done();
      child.kill('SIGTERM');
      reject(new ServerStartError(`opencode server did not start within ${timeoutMs} ms`, 1));
    }, timeoutMs);
    child.stdout.on('data', onData);
    child.once('close', onClose);
    child.once('error', onError);
  });
}
