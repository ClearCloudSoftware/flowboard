import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrompt } from '../src/prompt.ts';

test('renders the six parts in canonical order', () => {
  const out = renderPrompt({
    preamble: 'Task: Add login\n\nThe form posts to /api/login.',
    inputs: [{ type: 'research_brief', path: '/w/brief.md' }],
    outputs: [{ type: 'plan', path: '/w/plan.md' }],
    invocation: '/grill-me:grill-me',
    template: 'Focus on auth.',
    closing: 'This is a headless run. Use the ask_user tool for questions.',
  });
  assert.equal(
    out,
    [
      'Task: Add login\n\nThe form posts to /api/login.',
      'Read these first:\n- research_brief: /w/brief.md',
      'Write your output to:\n- plan: /w/plan.md',
      '/grill-me:grill-me',
      'Focus on auth.',
      'This is a headless run. Use the ask_user tool for questions.',
    ].join('\n\n'),
  );
});

test('omits empty parts', () => {
  assert.equal(renderPrompt({ preamble: 'P', inputs: [], outputs: [], closing: 'C' }), 'P\n\nC');
});

test('recalled memory goes just before the closing instruction', () => {
  assert.equal(renderPrompt({ preamble: 'P', inputs: [], outputs: [], template: 'T', memory: 'M', closing: 'C' }), 'P\n\nT\n\nM\n\nC');
});

test('without memory the prompt is the six parts as before', () => {
  const six = { preamble: 'P', inputs: [], outputs: [], template: 'T', closing: 'C' };
  assert.equal(renderPrompt(six), 'P\n\nT\n\nC');
  assert.equal(renderPrompt({ ...six, memory: '' }), 'P\n\nT\n\nC');
});
