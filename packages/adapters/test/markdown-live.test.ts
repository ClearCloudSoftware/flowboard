import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MarkdownTaskSource } from '../src/ticket/markdown/provider.ts';

const live = process.env.FLOWBOARD_LIVE === '1';
const here = import.meta.dirname;

test('live markdown round-trip against the backlog fixture', { skip: !live }, async () => {
  const path = join(here, 'fixtures/markdown/sample.md');
  const content = await readFile(path, 'utf8');
  const src = new MarkdownTaskSource();

  const r1 = await src.fetch({ path });
  const r2 = await src.fetch({ content });

  assert.deepEqual(
    r1.tasks.map((t) => t.importKey),
    r2.tasks.map((t) => t.importKey),
    'reading the same bytes two ways must produce the same keys',
  );
  assert.equal(r1.usage.bytesRead, content.length);
  assert.equal(r2.usage.bytesRead, content.length);
});
