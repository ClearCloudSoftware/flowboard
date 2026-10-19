import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Question } from '@flowboard/core';
import { noTerminal, parseTyped, terminalAnswerer } from '../src/ask/terminal.ts';
import type { Prompts } from '../src/ask/terminal.ts';

type Call = { kind: 'select' | 'checkbox' | 'input'; config: any };

/** Fake prompts: each call is recorded and answered by `reply(call)`. */
function fakePrompts(reply: (call: Call) => unknown) {
  const calls: Call[] = [];
  const make = (kind: Call['kind']) => (async (config: any) => {
    calls.push({ kind, config });
    return reply({ kind, config });
  }) as any;
  const prompts: Prompts = { select: make('select'), checkbox: make('checkbox'), input: make('input') };
  return { calls, prompts };
}

const signal = new AbortController().signal;
const yn = (required?: boolean): Question => ({ id: 'ok', prompt: 'OK?', kind: 'yes_no', ...(required === false && { required }) });
const pick = (kind: 'single_select' | 'multi_select', required?: boolean): Question => ({
  id: 'p',
  prompt: 'Pick',
  kind,
  options: [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ],
  ...(required === false && { required }),
});

test('parseTyped: numbers, empties and text', () => {
  const num: Question = { id: 'n', prompt: 'N?', kind: 'number' };
  const text: Question = { id: 't', prompt: 'T?', kind: 'text' };
  assert.deepEqual(parseTyped(num, '42'), { ok: true, value: 42 });
  assert.deepEqual(parseTyped(num, 'abc'), { ok: false, message: 'enter a number' });
  assert.deepEqual(parseTyped(text, ''), { ok: false, message: 'answer required' });
  assert.deepEqual(parseTyped({ ...text, required: false }, ' '), { ok: true, value: null });
  assert.deepEqual(parseTyped(text, ' hi '), { ok: true, value: 'hi' });
});

test('a batch shows "question i of n" and the help text', async () => {
  const printed: string[] = [];
  const { calls, prompts } = fakePrompts(() => 'x');
  const qs: Question[] = [
    { id: 'a', prompt: 'A?', help: 'Some context.', kind: 'text' },
    { id: 'b', prompt: 'B?', kind: 'text' },
  ];
  assert.deepEqual(await terminalAnswerer(prompts, (l) => printed.push(l))(qs, signal), { a: 'x', b: 'x' });
  assert.deepEqual(printed, ['question 1 of 2', 'question 2 of 2']);
  assert.match(calls[0].config.message, /A\?[\s\S]*Some context\./);
});

test('a single question has no "question i of n" line', async () => {
  const printed: string[] = [];
  await terminalAnswerer(fakePrompts(() => 'x').prompts, (l) => printed.push(l))([{ id: 'a', prompt: 'A?', kind: 'text' }], signal);
  assert.deepEqual(printed, []);
});

test('text and number use input with the parseTyped rules', async () => {
  const { calls, prompts } = fakePrompts(() => '7');
  const answers = await terminalAnswerer(prompts, () => {})([{ id: 'n', prompt: 'N?', kind: 'number' }], signal);
  assert.deepEqual(answers, { n: 7 });
  assert.equal(calls[0].kind, 'input');
  assert.equal(calls[0].config.validate('abc'), 'enter a number');
  assert.equal(calls[0].config.validate('3'), true);
});

test('yes_no maps to Yes/No and returns a boolean; optional adds Skip → null', async () => {
  const { calls, prompts } = fakePrompts(() => true);
  assert.deepEqual(await terminalAnswerer(prompts, () => {})([yn()], signal), { ok: true });
  assert.deepEqual(
    calls[0].config.choices.map((c: any) => c.name),
    ['Yes', 'No'],
  );
  const optional = fakePrompts((c) => c.config.choices.at(-1).value);
  assert.deepEqual(await terminalAnswerer(optional.prompts, () => {})([yn(false)], signal), { ok: null });
  assert.deepEqual(
    optional.calls[0].config.choices.map((c: any) => c.name),
    ['Yes', 'No', 'Skip'],
  );
});

test('single_select returns the option value; optional adds Skip → null', async () => {
  const { calls, prompts } = fakePrompts((c) => c.config.choices[1].value);
  assert.deepEqual(await terminalAnswerer(prompts, () => {})([pick('single_select')], signal), { p: 'b' });
  assert.deepEqual(
    calls[0].config.choices.map((c: any) => c.name),
    ['Alpha', 'Beta'],
  );
  const optional = fakePrompts((c) => c.config.choices.at(-1).value);
  assert.deepEqual(await terminalAnswerer(optional.prompts, () => {})([pick('single_select', false)], signal), { p: null });
});

test('multi_select: required needs a tick; optional with none ticked → null', async () => {
  const req = fakePrompts(() => ['a', 'b']);
  assert.deepEqual(await terminalAnswerer(req.prompts, () => {})([pick('multi_select')], signal), { p: ['a', 'b'] });
  assert.equal(req.calls[0].kind, 'checkbox');
  assert.equal(req.calls[0].config.required, true);
  const opt = fakePrompts(() => []);
  assert.deepEqual(await terminalAnswerer(opt.prompts, () => {})([pick('multi_select', false)], signal), { p: null });
  assert.equal(opt.calls[0].config.required, false);
});

test('the prompts get the abort signal', async () => {
  const seen: unknown[] = [];
  const prompts: Prompts = {
    select: (async (_c: any, ctx: any) => (seen.push(ctx?.signal), true)) as any,
    checkbox: (async () => []) as any,
    input: (async () => '') as any,
  };
  await terminalAnswerer(prompts, () => {})([yn()], signal);
  assert.equal(seen[0], signal);
});

test('noTerminal refuses with the fixed message', async () => {
  await assert.rejects(noTerminal([yn()], signal), { message: 'No one can answer questions in this run.' });
});
