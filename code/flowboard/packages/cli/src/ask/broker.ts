/**
 * The run-agent end of the ask protocol: listens on the run's Unix socket,
 * asks one batch at a time (first in, first out), and replies to the shim.
 * The worker broker will speak the same protocol later.
 *
 * See docs/FlowBoard/Human In The Loop/Ask User MCP Server.md.
 */
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import type { Answers, AskReply, AskRequest, Question } from '@flowboard/core';

/** Answers one batch; rejects with an error named 'ExitPromptError' when the owner pressed Ctrl+C. Must stop when `signal` aborts. */
export type Answerer = (questions: Question[], signal: AbortSignal) => Promise<Answers>;

export interface BrokerEvents {
  /** A batch is about to be shown. */
  onQuestion(questions: Question[]): void;
  onAnswer(answers: Answers): void;
  /** A shown or queued batch's connection closed, or the broker closed, first. */
  onWithdrawn(): void;
  /** No batch on screen or queued any more. */
  onDone(): void;
  /** The answerer reported Ctrl+C. */
  onInterrupt(): void;
}

interface Job {
  questions: Question[];
  conn: Socket;
  abort: AbortController;
}

export async function startBroker(socketPath: string, answer: Answerer, events: BrokerEvents): Promise<{ close(): Promise<void> }> {
  const queue: Job[] = [];
  const conns = new Set<Socket>();
  let current: Job | undefined;
  let current$: Promise<void> | undefined;

  const reply = (conn: Socket, r: AskReply) => {
    if (!conn.destroyed) conn.end(JSON.stringify(r) + '\n');
  };

  /** Drop a queued job, or abort the one on screen (which then reports itself withdrawn). */
  const withdraw = (job: Job) => {
    const i = queue.indexOf(job);
    if (i !== -1) {
      queue.splice(i, 1);
      events.onWithdrawn();
    } else if (job === current) {
      job.abort.abort();
    }
  };

  const next = () => {
    if (current) return;
    const job = queue.shift();
    if (!job) return;
    current = job;
    current$ = (async () => {
      events.onQuestion(job.questions);
      try {
        const answers = await answer(job.questions, job.abort.signal);
        if (job.abort.signal.aborted) events.onWithdrawn();
        else {
          events.onAnswer(answers);
          reply(job.conn, { answers });
        }
      } catch (e) {
        if (job.abort.signal.aborted) events.onWithdrawn();
        else if ((e as Error).name === 'ExitPromptError') {
          events.onInterrupt();
          reply(job.conn, { error: 'stopped' });
        } else reply(job.conn, { error: e instanceof Error ? e.message : String(e) });
      } finally {
        current = undefined;
        if (!queue.length) events.onDone();
        next();
      }
    })();
  };

  const server = createServer((conn) => {
    conns.add(conn);
    let buf = '';
    let job: Job | undefined;
    conn.on('data', (d) => {
      if (job) return;
      buf += d;
      const end = buf.indexOf('\n');
      if (end === -1) return;
      let request: AskRequest;
      try {
        request = JSON.parse(buf.slice(0, end)) as AskRequest;
        if (!Array.isArray(request.questions)) throw new Error('no questions');
      } catch (e) {
        return reply(conn, { error: `bad request: ${(e as Error).message}` });
      }
      job = { questions: request.questions, conn, abort: new AbortController() };
      queue.push(job);
      next();
    });
    conn.on('close', () => {
      conns.delete(conn);
      if (job) withdraw(job);
    });
    conn.on('error', () => {}); // a dropped shim surfaces as 'close'
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });

  return {
    async close() {
      for (const job of [...queue]) withdraw(job);
      if (current) withdraw(current);
      await current$;
      for (const c of conns) c.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
