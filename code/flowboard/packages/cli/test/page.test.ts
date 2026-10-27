import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Question } from '../../core/src/hitl/question.ts';
import { either, pageAnswerer, watchStop } from '../src/ask/page.ts';

const qs: Question[] = [
  { id: 'decision', kind: 'single_select', prompt: 'review: approval needed', options: [{ value: 'approve', label: 'Approve' }] },
  { id: 'note', kind: 'text', prompt: 'Note', required: false },
];
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
};

test('a question goes to a file, an answer file from the page settles it, and both files go', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-page-'));
  const asked = pageAnswerer(dir)(qs, new AbortController().signal, 'review needs a decision');
  await until(() => existsSync(join(dir, 'asks')) && readdirSync(join(dir, 'asks')).length > 0);
  const [file] = readdirSync(join(dir, 'asks'));
  const ask = JSON.parse(readFileSync(join(dir, 'asks', file), 'utf8'));
  assert.equal(ask.heading, 'review needs a decision');
  assert.deepEqual(ask.questions, qs);
  writeFileSync(join(dir, 'answers', file), JSON.stringify({ decision: 'approve', note: null }));
  assert.deepEqual(await asked, { decision: 'approve', note: null });
  assert.deepEqual(readdirSync(join(dir, 'asks')), []);
  assert.deepEqual(readdirSync(join(dir, 'answers')), []);
});

test('the first answer wins and withdraws the other; an abort withdraws both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-page-'));
  const terminal = async () => ({ decision: 'approve' });
  assert.deepEqual(await either(terminal, pageAnswerer(dir))(qs, new AbortController().signal), { decision: 'approve' });
  await until(() => readdirSync(join(dir, 'asks')).length === 0);
  assert.deepEqual(readdirSync(join(dir, 'asks')), []);

  const ab = new AbortController();
  const never = (_q: Question[], s: AbortSignal) => new Promise<never>((_, no) => s.addEventListener('abort', () => no(s.reason)));
  const asked = either(never, pageAnswerer(dir))(qs, ab.signal);
  ab.abort(new Error('stopping'));
  await assert.rejects(asked, /stopping/);
});

test('a stop file from the page stops the flow once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-page-'));
  let stops = 0;
  const unwatch = watchStop(dir, () => stops++);
  writeFileSync(join(dir, 'stop'), '');
  await until(() => stops > 0);
  unwatch();
  assert.equal(stops, 1);
  assert.equal(existsSync(join(dir, 'stop')), false);
});
