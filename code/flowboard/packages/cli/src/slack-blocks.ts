/**
 * Block Kit for an escalated question: the channel message, the modal that answers it, and the repaint once it is
 * answered or stops waiting. Questions come from agents that read untrusted repos, so every bit of their text goes in
 * as `plain_text`, which Slack never parses for mentions or links, cut to Block Kit's limits. Options are sent as
 * their index, never their value. Only the notification's fallback `text` is mrkdwn, and it is escaped. Pure: no I/O.
 */
import type { Answers, AnswerValue, Question } from '../../core/src/hitl/question.ts';
import type { PageAsk } from './ask/page.ts';

/** Where an answer came from, as the repaint says it. */
export type Where = 'Slack' | 'FlowBoard' | 'the terminal';
/** Block Kit JSON is loose by nature; `any` keeps the tests and callers free to read into it. */
export type Blocks = { text: string; blocks: any[] };
export type View = Record<string, any>;

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const escapeMrkdwn = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A `plain_text` object; Slack refuses an empty one. */
const pt = (text: string, n = 3000) => ({ type: 'plain_text', text: clip(text, n) || '-', emoji: false });

const MAX_SECTIONS = 45; // a message holds 50 blocks: header, context, the questions, a "more" line and the buttons
const MAX_INPUTS = 99; // a modal holds 100 blocks: a context line and the questions
const MAX_OPTIONS = 100;
const MAX_RADIOS = 10;

/** The step that asks: `-- review asks:` → `review`; a gate's prompt starts `<step>: `. */
export function stepOf(ask: PageAsk): string {
  const m = /^-- (.+) asks:$/.exec(ask.heading);
  if (m) return m[1];
  const p = ask.questions[0]?.prompt ?? '';
  return p.includes(':') ? p.slice(0, p.indexOf(':')) : 'a gate';
}

const where = (project: string, run: string, ask: PageAsk) => pt(`${project} · run ${run} · ${stepOf(ask)}`, 2000);

const describe = (q: Question) => {
  const lines = [q.prompt];
  if (q.help) lines.push(q.help);
  if (q.kind === 'yes_no') lines.push('Yes or no');
  if (q.options?.length) lines.push(`Options: ${q.options.map((o) => o.label).join(' · ')}`);
  return lines.join('\n');
};

export function askMessage(a: { project: string; run: string; ask: PageAsk; address: string }): Blocks {
  const qs = a.ask.questions;
  const more = qs.length - MAX_SECTIONS;
  return {
    text: escapeMrkdwn(clip(`FlowBoard: ${a.project} asks: ${qs[0]?.prompt ?? ''}`, 300)),
    blocks: [
      { type: 'header', text: pt('FlowBoard: a question is waiting', 150) },
      { type: 'context', elements: [where(a.project, a.run, a.ask)] },
      ...qs.slice(0, MAX_SECTIONS).map((q) => ({ type: 'section', text: pt(describe(q)) })),
      ...(more > 0 ? [{ type: 'section', text: pt(`and ${more} more, in the modal`) }] : []),
      {
        type: 'actions',
        elements: [
          { type: 'button', action_id: 'fb_answer', style: 'primary', text: pt('Answer', 75), value: clip(`${a.run}/${a.ask.id}`, 2000) },
          { type: 'button', action_id: 'fb_open', text: pt('Open in FlowBoard', 75), url: clip(`${a.address}/runs?run=${encodeURIComponent(a.run)}`, 3000) },
        ],
      },
    ],
  };
}

const option = (label: string, i: number) => ({ text: pt(label, 75), value: String(i) });

function element(q: Question): object {
  if (q.kind === 'yes_no') return { type: 'radio_buttons', action_id: 'v', options: [option('Yes', 0), option('No', 1)] };
  // ponytail: a select past 100 options can't pick the rest; agents ask a handful
  const options = (q.options ?? []).slice(0, MAX_OPTIONS).map((o, i) => option(o.label, i));
  if (q.kind === 'single_select') return options.length <= MAX_RADIOS ? { type: 'radio_buttons', action_id: 'v', options } : { type: 'static_select', action_id: 'v', placeholder: pt('Pick one', 150), options };
  if (q.kind === 'multi_select') return { type: 'multi_static_select', action_id: 'v', placeholder: pt('Pick any', 150), options };
  if (q.kind === 'number') return { type: 'plain_text_input', action_id: 'v', placeholder: pt('a number', 150) };
  return { type: 'plain_text_input', action_id: 'v', multiline: true };
}

/** The `views.open` view answering the whole batch; `private_metadata` says which run and ask. */
export function askModal(a: { run: string; ask: PageAsk }): View {
  return {
    type: 'modal',
    callback_id: 'fb_answer',
    title: pt('Answer FlowBoard', 24),
    submit: pt('Send', 24),
    close: pt('Cancel', 24),
    private_metadata: JSON.stringify({ run: a.run, id: a.ask.id }),
    blocks: [
      { type: 'context', elements: [pt(`run ${a.run} · ${stepOf(a.ask)}`, 2000)] },
      ...a.ask.questions.slice(0, MAX_INPUTS).map((q, i) => ({
        type: 'input',
        block_id: `q${i}`,
        ...(q.required === false && { optional: true }),
        label: pt(q.prompt, 2000),
        ...(q.help && { hint: pt(q.help, 2000) }),
        element: element(q),
      })),
    ],
  };
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/** A submitted modal's `view.state.values` as the ask's answers, or the errors to show on its blocks. */
export function answersFromView(ask: PageAsk, values: Record<string, Record<string, any>>): { answers: Answers } | { errors: Record<string, string> } {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  ask.questions.forEach((q, i) => {
    const v = values?.[`q${i}`]?.v;
    const pick = (o: { value?: unknown } | undefined) => (o ? Number(o.value) : undefined);
    const optionAt = (n: number | undefined) => (n === undefined ? undefined : Number.isInteger(n) ? q.options?.[n] : undefined);
    if (q.kind === 'yes_no') {
      const n = pick(v?.selected_option);
      if (n === undefined) answers[q.id] = null;
      else if (n === 0 || n === 1) answers[q.id] = n === 0;
      else errors[`q${i}`] = 'not one of its options';
    } else if (q.kind === 'single_select') {
      const n = pick(v?.selected_option);
      if (n === undefined) answers[q.id] = null;
      else if (optionAt(n)) answers[q.id] = optionAt(n)!.value;
      else errors[`q${i}`] = 'not one of its options';
    } else if (q.kind === 'multi_select') {
      const picked = ((v?.selected_options ?? []) as { value?: unknown }[]).map((o) => optionAt(pick(o)));
      if (picked.some((o) => !o)) errors[`q${i}`] = 'not among its options';
      else answers[q.id] = picked.length ? picked.map((o) => o!.value) : null;
    } else {
      const text = typeof v?.value === 'string' ? v.value : '';
      if (q.kind === 'text') answers[q.id] = text === '' ? null : text;
      else if (text.trim() === '') answers[q.id] = null;
      else if (NUMBER.test(text.trim())) answers[q.id] = Number(text.trim());
      else errors[`q${i}`] = 'a number, like 3 or 2.5';
    }
  });
  return Object.keys(errors).length ? { errors } : { answers };
}

const answerText = (q: Question, v: AnswerValue | undefined) => {
  if (v == null) return 'skipped';
  const label = (x: string) => q.options?.find((o) => o.value === x)?.label ?? x;
  if (q.kind === 'yes_no') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(label).join(', ');
  return q.kind === 'single_select' ? label(String(v)) : String(v);
};

/** The message once its question is answered (`by`) or no longer waits (`by: null`): what, where, and no buttons. */
export function closedMessage(a: { project: string; run: string; ask: PageAsk; by: Where | null; answers?: Answers; slackUser?: string }): Blocks {
  const head = a.by === null ? 'No longer waiting: the run ended' : a.by === 'Slack' && a.slackUser ? `Answered in Slack by ${a.slackUser}` : `Answered in ${a.by}`;
  const answers = a.answers;
  return {
    text: escapeMrkdwn(clip(`FlowBoard: ${head}`, 300)),
    blocks: [
      { type: 'header', text: pt(head, 150) },
      { type: 'context', elements: [where(a.project, a.run, a.ask)] },
      ...a.ask.questions.slice(0, MAX_SECTIONS).map((q) => ({ type: 'section', text: pt(answers ? `${q.prompt}: ${answerText(q, answers[q.id])}` : q.prompt) })),
    ],
  };
}

/** A modal that only says something, for an Answer clicked after the fact. */
export const noticeModal = (text: string): View => ({ type: 'modal', title: pt('FlowBoard', 24), close: pt('Close', 24), blocks: [{ type: 'section', text: pt(text) }] });

/** A plain message, for the budget's: the text in a `plain_text` section, the fallback escaped. */
export const noteMessage = (text: string): Blocks => ({ text: escapeMrkdwn(clip(text, 300)), blocks: [{ type: 'section', text: pt(text) }] });
