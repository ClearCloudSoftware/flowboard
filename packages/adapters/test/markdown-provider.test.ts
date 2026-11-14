import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkdownTaskSource } from '../src/ticket/markdown/provider.ts';

test('idempotent when re-parsed: same keys, body picks up edits', async () => {
  const src = new MarkdownTaskSource();
  const r1 = await src.fetch({ content: '## A\n\na.\n\n## B\n\nb.' });
  const r2 = await src.fetch({ content: '## A\n\na EDITED.\n\n## B\n\nb.' });
  assert.deepEqual(
    r1.tasks.map((t) => t.importKey),
    r2.tasks.map((t) => t.importKey),
  );
  assert.equal(r2.tasks[0]?.body, 'a EDITED.');
});

test('reads from a file when path is given', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'md-'));
  const path = join(dir, 'backlog.md');
  await writeFile(path, '## X\n\nfrom file.\n', 'utf8');
  const src = new MarkdownTaskSource();
  const r = await src.fetch({ path });
  assert.equal(r.tasks[0]?.title, 'X');
  assert.equal(r.tasks[0]?.body, 'from file.');
  assert.equal(r.usage.bytesRead, '## X\n\nfrom file.\n'.length);
});

test('refuses both path and content at once', async () => {
  const src = new MarkdownTaskSource();
  await assert.rejects(src.fetch({ path: '/x', content: 'y' }), /not both/);
});

test('refuses neither path nor content', async () => {
  const src = new MarkdownTaskSource();
  await assert.rejects(src.fetch({}), /pass content or path/);
});

test('reports zero requests and counts bytesRead', async () => {
  const src = new MarkdownTaskSource();
  const r = await src.fetch({ content: '## X\n' });
  assert.equal(r.usage.requests, 0);
  assert.equal(r.usage.bytesRead, 5);
});

test('capabilities include pull, rich_body, acceptance_criteria', () => {
  const src = new MarkdownTaskSource();
  assert.ok(src.capabilities.has('pull'));
  assert.ok(src.capabilities.has('rich_body'));
  assert.ok(src.capabilities.has('acceptance_criteria'));
  assert.equal(src.capabilities.has('push'), false);
});
