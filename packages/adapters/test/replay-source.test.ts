import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReplayTaskSource } from '../src/ticket/replay/replay-source.ts';

test('yields scripted pages in order and stops', async () => {
  const src = new ReplayTaskSource({
    script: [
      {
        tasks: [{ importKey: 'a', title: 'A', _hint: { titleSlug: 'a' } }],
        nextCursor: 'c1',
        usage: { requests: 1 },
      },
      {
        tasks: [{ importKey: 'b', title: 'B', _hint: { titleSlug: 'b' } }],
        usage: { requests: 1 },
      },
    ],
  });
  const p1 = await src.fetch!({});
  assert.equal(p1.tasks[0]?.importKey, 'a');
  assert.equal(p1.nextCursor, 'c1');
  const p2 = await src.fetch!({ cursor: 'c1' });
  assert.equal(p2.tasks[0]?.importKey, 'b');
  assert.equal(p2.nextCursor, undefined);
});

test('rejects fetch past the end of the script', async () => {
  const src = new ReplayTaskSource({ script: [{ tasks: [], usage: { requests: 0 } }] });
  await src.fetch!({});
  await assert.rejects(src.fetch!({}), /script exhausted/);
});

test('defaults to { pull } capability', () => {
  const src = new ReplayTaskSource({ script: [] });
  assert.ok(src.capabilities.has('pull'));
  assert.equal(src.capabilities.has('push'), false);
  assert.equal(src.fetch !== undefined, true);
  assert.equal(src.ingest, undefined);
});

test('push capability wires ingest() and pops the same script', async () => {
  const src = new ReplayTaskSource({
    script: [{ tasks: [{ importKey: 'x', title: 'X', _hint: { titleSlug: 'x' } }], usage: { requests: 0 } }],
    capabilities: new Set(['push']),
  });
  assert.equal(src.fetch, undefined);
  assert.equal(src.ingest !== undefined, true);
  const r = await src.ingest!(Buffer.from('ignored'), {});
  assert.equal(r.tasks[0]?.importKey, 'x');
});

test('id is "replay"', () => {
  const src = new ReplayTaskSource({ script: [] });
  assert.equal(src.id, 'replay');
});
