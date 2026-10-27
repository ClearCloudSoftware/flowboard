/**
 * run-flow's page channel (`--page`): what the terminal would ask is also written to `<runDir>/asks/<id>.json`,
 * and the runs page answers by writing `<runDir>/answers/<id>.json`. The first answer, terminal or page, wins.
 * A page writing `<runDir>/stop` asks the flow to stop, as one Ctrl+C would.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Answers, Question } from '../../../core/src/hitl/question.ts';

const POLL_MS = 400;
let next = 0;

/** An ask as the page reads it: `heading` says who asks (a step's gate, or a step's agent). */
export interface PageAsk { id: string; heading: string; questions: Question[]; at: string }

/** Every required question has an answer: the page's file is taken as written only then. */
const complete = (questions: Question[], a: unknown): a is Answers =>
  typeof a === 'object' && a !== null && questions.every((q) => q.required === false || (a as Record<string, unknown>)[q.id] != null);

export function pageAnswerer(runDir: string) {
  return (questions: Question[], signal: AbortSignal, heading = ''): Promise<Answers> => {
    const id = `${Date.now()}-${next++}`;
    const ask = join(runDir, 'asks', `${id}.json`);
    const answer = join(runDir, 'answers', `${id}.json`);
    mkdirSync(join(runDir, 'asks'), { recursive: true });
    mkdirSync(join(runDir, 'answers'), { recursive: true });
    writeFileSync(ask, JSON.stringify({ id, heading, questions, at: new Date().toISOString() } satisfies PageAsk));
    return new Promise<Answers>((resolve, reject) => {
      const done = () => {
        clearInterval(timer);
        signal.removeEventListener('abort', aborted);
        rmSync(ask, { force: true });
        rmSync(answer, { force: true });
      };
      const aborted = () => {
        done();
        reject(signal.reason);
      };
      const timer = setInterval(() => {
        if (!existsSync(answer)) return;
        let a: unknown;
        try {
          a = JSON.parse(readFileSync(answer, 'utf8'));
        } catch {
          return; // still being written
        }
        done();
        if (complete(questions, a)) resolve(a);
        else reject(new Error('the page sent an incomplete answer'));
      }, POLL_MS);
      if (signal.aborted) aborted();
      else signal.addEventListener('abort', aborted);
    });
  };
}

/** Asks both; the first answer wins and withdraws the other. One that fails on its own leaves the other asking. */
export function either(a: (q: Question[], s: AbortSignal, h?: string) => Promise<Answers>, b: (q: Question[], s: AbortSignal, h?: string) => Promise<Answers>) {
  return (questions: Question[], signal: AbortSignal, heading?: string): Promise<Answers> => {
    const both = new AbortController();
    const stop = () => both.abort(signal.reason);
    signal.addEventListener('abort', stop);
    return Promise.any([a(questions, both.signal, heading), b(questions, both.signal, heading)])
      .catch((e: AggregateError) => {
        throw signal.aborted ? signal.reason : e.errors.find((x) => (x as Error)?.name === 'ExitPromptError') ?? e.errors[0];
      })
      .finally(() => {
        signal.removeEventListener('abort', stop);
        both.abort();
      });
  };
}

/** Calls `onStop` once `<runDir>/stop` appears (the file is taken away); returns the function that stops watching. */
export function watchStop(runDir: string, onStop: () => void): () => void {
  const file = join(runDir, 'stop');
  const timer = setInterval(() => {
    if (!existsSync(file)) return;
    rmSync(file, { force: true });
    onStop();
  }, POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
