import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PageAsk } from '../src/ask/page.ts';
import { answersFromView, askMessage, askModal, clip, closedMessage, escapeMrkdwn, noticeModal, stepOf } from '../src/slack-blocks.ts';

const RUN = '2026-11-15T10-00-00-delivery';
const ask = (questions: PageAsk['questions'], heading = '-- review asks:'): PageAsk => ({ id: '1700-0', heading, questions, at: '2026-11-15T10:00:00.000Z' });
const GATE = ask(
  [
    { id: 'decision', kind: 'single_select', prompt: 'review: the verdict says changes are needed', options: [{ value: 'approve', label: 'Approve' }, { value: 'retry', label: 'Retry' }, { value: 'stop', label: 'Stop' }] },
    { id: 'note', kind: 'text', prompt: 'Note for the next run (optional)', required: false },
  ],
  '',
);

/** Every object in a Block Kit tree. */
const walk = (v: unknown, out: any[] = []): any[] => {
  if (v && typeof v === 'object') {
    out.push(v);
    for (const x of Object.values(v)) walk(x, out);
  }
  return out;
};

test('the message is plain text with an Answer button and a link', () => {
  const m = askMessage({ project: 'Scratch', run: RUN, ask: GATE, address: 'http://localhost:3000' });
  assert.equal(m.blocks[0].type, 'header');
  assert.equal((m.blocks[0] as any).text.text, 'Lamproom: a question is waiting');
  assert.equal((m.blocks[1] as any).elements[0].text, `Scratch · run ${RUN} · review`);
  const sections = m.blocks.filter((b: any) => b.type === 'section') as any[];
  assert.equal(sections.length, 2);
  assert.equal(sections[0].text.type, 'plain_text');
  assert.match(sections[0].text.text, /^review: the verdict says changes are needed\nOptions: Approve · Retry · Stop$/);
  const actions = m.blocks.at(-1) as any;
  assert.equal(actions.type, 'actions');
  assert.deepEqual(actions.elements[0], { type: 'button', action_id: 'lr_answer', style: 'primary', text: { type: 'plain_text', text: 'Answer', emoji: false }, value: `${RUN}/1700-0` });
  assert.equal(actions.elements[1].url, `http://localhost:3000/runs?run=${RUN}`);
  assert.equal(actions.elements[1].text.text, 'Open in Lamproom');
  assert.match(m.text, /Scratch/);
});

test('stepOf: an agent says its step in the heading; a gate in its prompt', () => {
  assert.equal(stepOf(ask([{ id: 'a', kind: 'text', prompt: 'Which?' }], '-- build asks:')), 'build');
  assert.equal(stepOf(GATE), 'review');
});

test('hostile text is cut to Block Kit’s limits and never mrkdwn', () => {
  const evil = '<!channel> <https://evil.example|click> & more';
  const many = Array.from({ length: 300 }, (_, i) => ({ value: `${'v'.repeat(200)}${i}`, label: i === 0 ? evil : `option ${'x'.repeat(100)} ${i}` }));
  const a = ask([
    { id: 'big', kind: 'text', prompt: `${evil} ${'p'.repeat(5000)}`, help: 'h'.repeat(5000) },
    { id: 'pick', kind: 'single_select', prompt: 'Pick', options: many },
    { id: 'multi', kind: 'multi_select', prompt: 'Many', options: many },
  ], `-- ${'s'.repeat(300)} asks:`);
  const m = askMessage({ project: evil, run: RUN, ask: a, address: 'http://localhost:3000' });
  const v = askModal({ run: RUN, ask: a });
  for (const o of [...walk(m.blocks), ...walk(v)]) {
    assert.notEqual(o.type, 'mrkdwn');
    if (o.type === 'plain_text') assert.ok(o.text.length >= 1 && o.text.length <= 3000, `a text of ${o.text.length}`);
    if (o.type === 'header') assert.ok(o.text.text.length <= 150);
    if (o.type === 'input') assert.ok(o.label.text.length <= 2000 && (!o.hint || o.hint.text.length <= 2000));
    if (Array.isArray(o.options)) {
      assert.ok(o.options.length <= 100);
      for (const opt of o.options) assert.ok(opt.text.text.length <= 75 && opt.value.length <= 150);
    }
  }
  assert.ok(m.blocks.length <= 50);
  assert.ok(!m.text.includes('<'), m.text);
  assert.match(m.text, /&lt;!channel&gt;/);
  assert.ok(v.title.text.length <= 24);
  assert.ok(v.private_metadata.length <= 3000);
  assert.equal(escapeMrkdwn('a & <b> c'), 'a &amp; &lt;b&gt; c');
  assert.equal(clip('abcdef', 4), 'abc…');
  assert.equal(clip('abc', 4), 'abc');
});

const FIVE = ask([
  { id: 'ok', kind: 'yes_no', prompt: 'Ship it?' },
  { id: 'one', kind: 'single_select', prompt: 'Which?', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] },
  { id: 'twelve', kind: 'single_select', prompt: 'Which of twelve?', options: Array.from({ length: 12 }, (_, i) => ({ value: `o${i}`, label: `O${i}` })) },
  { id: 'many', kind: 'multi_select', prompt: 'Which ones?', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  { id: 'n', kind: 'number', prompt: 'How many?' },
  { id: 'why', kind: 'text', prompt: 'Why?', required: false },
]);

test('the modal holds every question, as the control its kind needs', () => {
  const v = askModal({ run: RUN, ask: FIVE });
  assert.equal(v.type, 'modal');
  assert.equal(v.callback_id, 'lr_answer');
  assert.equal(v.title.text, 'Answer Lamproom');
  assert.equal(v.submit.text, 'Send');
  assert.equal(v.close.text, 'Cancel');
  assert.deepEqual(JSON.parse(v.private_metadata), { run: RUN, id: '1700-0' });
  const inputs = v.blocks.filter((b: any) => b.type === 'input');
  assert.deepEqual(inputs.map((b: any) => [b.block_id, b.element.type, b.element.action_id, !!b.optional]), [
    ['q0', 'radio_buttons', 'v', false],
    ['q1', 'radio_buttons', 'v', false],
    ['q2', 'static_select', 'v', false],
    ['q3', 'multi_static_select', 'v', false],
    ['q4', 'plain_text_input', 'v', false],
    ['q5', 'plain_text_input', 'v', true],
  ]);
  assert.deepEqual(inputs[0].element.options.map((o: any) => [o.text.text, o.value]), [['Yes', '0'], ['No', '1']]);
  assert.deepEqual(inputs[1].element.options.map((o: any) => o.value), ['0', '1', '2']);
  assert.equal(inputs[5].element.multiline, true);
});

test('a submitted modal becomes answers; a number that is not one is an error on its block', () => {
  const values = {
    q0: { v: { type: 'radio_buttons', selected_option: { value: '1' } } },
    q1: { v: { type: 'radio_buttons', selected_option: { value: '2' } } },
    q2: { v: { type: 'static_select', selected_option: { value: '11' } } },
    q3: { v: { type: 'multi_static_select', selected_options: [{ value: '1' }, { value: '0' }] } },
    q4: { v: { type: 'plain_text_input', value: ' 2.5 ' } },
    q5: { v: { type: 'plain_text_input', value: null } },
  };
  assert.deepEqual(answersFromView(FIVE, values), { answers: { ok: false, one: 'c', twelve: 'o11', many: ['y', 'x'], n: 2.5, why: null } });
  assert.deepEqual(answersFromView(FIVE, { ...values, q4: { v: { type: 'plain_text_input', value: 'abc' } } }), { errors: { q4: 'a number, like 3 or 2.5' } });
  assert.deepEqual(answersFromView(FIVE, { ...values, q1: { v: { type: 'radio_buttons', selected_option: { value: '9' } } } }), { errors: { q1: 'not one of its options' } });
});

test('the repaint says where and what, and has no buttons', () => {
  const m = closedMessage({ project: 'Scratch', run: RUN, ask: GATE, by: 'Slack', slackUser: 'alex', answers: { decision: 'approve', note: null } });
  const texts = walk(m.blocks).filter((o) => o.type === 'plain_text').map((o) => o.text);
  assert.ok(texts.includes('Answered in Slack by alex'));
  assert.ok(texts.includes('review: the verdict says changes are needed: Approve'));
  assert.ok(texts.includes('Note for the next run (optional): skipped'));
  assert.ok(!m.blocks.some((b: any) => b.type === 'actions'));
  assert.match(m.text, /Answered in Slack by alex/);
  const y = closedMessage({ project: 'S', run: RUN, ask: FIVE, by: 'Lamproom', answers: { ok: true, one: 'a', twelve: 'o1', many: ['x', 'y'], n: 3, why: 'because' } });
  const yt = walk(y.blocks).filter((o) => o.type === 'plain_text').map((o) => o.text);
  assert.ok(yt.includes('Answered in Lamproom') && yt.includes('Ship it?: Yes') && yt.includes('Which ones?: X, Y') && yt.includes('How many?: 3'));
  const t = closedMessage({ project: 'S', run: RUN, ask: GATE, by: 'the terminal' });
  assert.ok(walk(t.blocks).some((o) => o.text === 'Answered in the terminal'));
  const gone = closedMessage({ project: 'S', run: RUN, ask: GATE, by: null });
  assert.ok(walk(gone.blocks).some((o) => o.text === 'No longer waiting: the run ended'));
  assert.ok(!gone.blocks.some((b: any) => b.type === 'actions'));
  const n = noticeModal('Already answered in Lamproom.');
  assert.equal(n.type, 'modal');
  assert.equal(n.submit, undefined);
  assert.ok(walk(n).some((o) => o.text === 'Already answered in Lamproom.'));
});
