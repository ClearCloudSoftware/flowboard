import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestions } from '../src/hitl/question.ts';
import type { Question } from '../src/hitl/question.ts';

const q = (id: string): Question => ({ id, prompt: `${id}?`, kind: 'text' });

test('a valid batch passes', () => assert.equal(checkQuestions([{ id: 'a', prompt: 'A?', kind: 'text' }]), undefined));
test('an empty batch is refused', () => assert.equal(checkQuestions([]), 'no questions'));
test('duplicate ids are refused', () => assert.equal(checkQuestions([q('a'), q('a')]), 'duplicate question id "a"'));
test('a select kind needs options', () =>
  assert.equal(checkQuestions([{ id: 's', prompt: 'S?', kind: 'single_select' }]), 'question "s" needs options'));
test('an empty prompt is refused', () =>
  assert.equal(checkQuestions([{ id: 'a', prompt: ' ', kind: 'text' }]), 'question "a" has no prompt'));
