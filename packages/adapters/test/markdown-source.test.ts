import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyTasks } from '@lamproom/core';
import { MarkdownTaskSource, parseMarkdown } from '../src/source/markdown.ts';

const keys = (md: string) => parseMarkdown(md).map((t) => t.import_key);

test('markdown: shape A, a heading per task, with an explicit {#id}', () => {
  const a = parseMarkdown('## Add OAuth login\nSupport Google + GitHub.\n\n## Fix flaky test {#flaky-cart}\nRetries needed.');
  assert.deepEqual(a, [
    { import_key: 'add-oauth-login', title: 'Add OAuth login', body: 'Support Google + GitHub.' },
    { import_key: 'flaky-cart', title: 'Fix flaky test', body: 'Retries needed.' },
  ]);
});

test('markdown: shape B, a category heading whose bold bullets are the tasks', () => {
  const b = parseMarkdown('## Backlog\n- **Filter list by status** — add a dropdown\n* **Export CSV**: from the table\n- **Bare**');
  assert.deepEqual(b.map((t) => [t.import_key, t.title, t.body]), [
    ['filter-list-by-status', 'Filter list by status', 'add a dropdown'],
    ['export-csv', 'Export CSV', 'from the table'],
    ['bare', 'Bare', undefined],
  ]);
});

test('markdown: the same input gives the same keys every time (the drift bug)', () => {
  const md = '## Filter list by status\n## Same\n## Same';
  assert.deepEqual(parseMarkdown(md), parseMarkdown(md));
  assert.deepEqual(keys(md), ['filter-list-by-status', 'same', 'same-2']);
});

test('markdown: acceptance criteria and non-goals sub-sections fill the task, not new tasks', () => {
  const [t, u] = parseMarkdown(
    '## Filter by status\nA dropdown.\n\n### Acceptance criteria\n- [ ] Choosing a status filters\n- Clearing shows all\n\n#### Non-goals\n1. Dates\n\n## Next one\n### Out of scope:\nmobile',
  );
  assert.deepEqual(t, { import_key: 'filter-by-status', title: 'Filter by status', body: 'A dropdown.', acceptance_criteria: ['Choosing a status filters', 'Clearing shows all'], non_goals: ['Dates'] });
  assert.deepEqual(u.non_goals, ['mobile']);
});

test('markdown: what is not a task', () => {
  assert.deepEqual(parseMarkdown(''), []);
  // Text and a level-1 title before the first ##, a #### that is not a sub-section (body), a sub-section with no task.
  assert.deepEqual(keys('# Title\nintro\n### AC\n- orphan\n## Real\n#### Detail\ntext'), ['real']);
  assert.equal(parseMarkdown('## Real\n#### Detail\ntext')[0].body, '#### Detail\ntext');
  // Plain bullets are a body; only bold bullets make a category.
  assert.equal(parseMarkdown('## T\n- one\n- two')[0].body, '- one\n- two');
});

test('markdown: front matter id keys a one-task file only', () => {
  assert.deepEqual(keys('---\nid: auth-12\n---\n## Log out everywhere'), ['auth-12']);
  assert.deepEqual(keys('---\nid: auth-12\n---\n## One\n## Two'), ['one', 'two']);
});

test('keys: server-derived; a bad or repeated explicit id falls back, an unsluggable title is "task"', () => {
  assert.deepEqual(keyTasks([{ title: 'A', id: 'k' }, { title: 'B', id: 'k' }, { title: 'C', id: 'not a key!' }, { title: '日本語' }, { title: '  ' }]).map((t) => t.import_key), ['k', 'k-2', 'c', 'task']);
  assert.deepEqual(keyTasks([{ title: 'X', id: 'AUTH-12' }])[0].import_key, 'auth-12');
});

test('MarkdownTaskSource: reads a path; pasted content wins', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'lr-md-')), 'backlog.md');
  writeFileSync(file, '## From file');
  const src = new MarkdownTaskSource();
  assert.deepEqual((await src.fetch({ path: file })).map((t) => t.title), ['From file']);
  assert.deepEqual((await src.fetch({ path: file, content: '## Pasted' })).map((t) => t.title), ['Pasted']);
});
