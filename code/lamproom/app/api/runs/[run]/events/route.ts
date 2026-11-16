import { watch } from 'node:fs';
import { join } from 'node:path';
import { readRun } from '../../../../../packages/cli/src/flow-logs.ts';
import { refused, runsDir } from '../../../flows/local.ts';

/**
 * Server-sent events: `change` whenever a file in the run folder changes (a log line, state, a question), so the
 * page refetches at once instead of on its next poll. A comment every 15 s keeps the connection open.
 */
export async function GET(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  if (!readRun(runsDir(), run)) return Response.json({ error: `no run ${run}` }, { status: 404 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };
      // ponytail: one watcher per open page; a shared one if many pages watch one run
      const watcher = watch(join(runsDir(), run), { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => send('data: change\n\n'), 150);
      });
      const beat = setInterval(() => send(': beat\n\n'), 15_000);
      const close = () => {
        watcher.close();
        clearInterval(beat);
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener('abort', close);
      send('data: change\n\n');
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
