/**
 * Asks a batch of questions in the terminal: arrow keys (or option numbers,
 * or the first letters) for choices, typing for text and numbers.
 */
import { checkbox, input, select } from '@inquirer/prompts';
import type { AnswerValue, Answers, Question } from '@flowboard/core';
import type { Answerer } from './broker.ts';

export interface Prompts {
  select: typeof select;
  checkbox: typeof checkbox;
  input: typeof input;
}

/** For a run with no terminal: the agent is told, and carries on. */
export const noTerminal: Answerer = async () => {
  throw new Error('No one can answer questions in this run.');
};

/** text/number input rules: the value, or a message to show and ask again. */
export function parseTyped(q: Question, raw: string): { ok: true; value: AnswerValue } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return q.required === false ? { ok: true, value: null } : { ok: false, message: 'answer required' };
  if (q.kind !== 'number') return { ok: true, value: t };
  const n = Number(t);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, message: 'enter a number' };
}

async function askOne(p: Prompts, q: Question, signal: AbortSignal): Promise<AnswerValue> {
  const message = q.help ? `${q.prompt}\n  ${q.help}\n` : q.prompt;
  const required = q.required !== false;
  const skip = required ? [] : [{ name: 'Skip', value: null }];
  const ctx = { signal };
  const theme = { indexMode: 'number' as const };
  switch (q.kind) {
    case 'yes_no':
      return p.select<boolean | null>(
        { message, theme, choices: [{ name: 'Yes', value: true }, { name: 'No', value: false }, ...skip] },
        ctx,
      );
    case 'single_select':
      return p.select<string | null>(
        { message, theme, choices: [...(q.options ?? []).map((o) => ({ name: o.label, value: o.value })), ...skip] },
        ctx,
      );
    case 'multi_select': {
      const picked = await p.checkbox<string>(
        { message, required, choices: (q.options ?? []).map((o) => ({ name: o.label, value: o.value })) },
        ctx,
      );
      return picked.length ? picked : null;
    }
    default: {
      const validate = (raw: string) => {
        const r = parseTyped(q, raw);
        return r.ok ? true : r.message;
      };
      const raw = await p.input({ message, validate }, ctx);
      const r = parseTyped(q, raw);
      return r.ok ? r.value : null;
    }
  }
}

export function terminalAnswerer(prompts: Prompts = { select, checkbox, input }, print: (line: string) => void = console.log): Answerer {
  return async (questions, signal) => {
    const answers: Answers = {};
    for (const [i, q] of questions.entries()) {
      if (questions.length > 1) print(`question ${i + 1} of ${questions.length}`);
      answers[q.id] = await askOne(prompts, q, signal);
    }
    return answers;
  };
}
