/**
 * Live checks that an agent can ask through ask_user and use the answer, on
 * both adapters. They spend Claude quota and OpenRouter credit, so they run
 * only with FLOWBOARD_LIVE=1 (`pnpm test:live`). The six-minute waits also
 * need FLOWBOARD_LIVE_SLOW=1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../src/run.ts';

const live = { skip: !process.env.FLOWBOARD_LIVE, timeout: 600_000 };
const slow = { skip: !process.env.FLOWBOARD_LIVE || !process.env.FLOWBOARD_LIVE_SLOW, timeout: 900_000 };
const OPENCODE_MODEL = process.env.FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash';

async function askRun(adapter: string, model: string, delayMs = 0) {
  const base = mkdtempSync(join(tmpdir(), 'fb-ask-live-'));
  mkdirSync(join(base, 'proj'));
  writeFileSync(
    join(base, 'task.md'),
    'Ask the user for their favourite colour with the ask_user tool (a text question with id "colour"), then reply with exactly that colour and nothing else.',
  );
  writeFileSync(
    join(base, 'task.yaml'),
    `adapter: ${adapter}\nmodel: ${model}\nfolder: proj\nprompt: task.md\nlimits:\n  max_turns: 4\n  budget_usd: 0.2\n`,
  );
  const out: string[] = [];
  const code = await runAgent(['task.yaml'], {
    cwd: base,
    print: (l) => out.push(l),
    signals: new EventEmitter(),
    answer: async (questions) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return Object.fromEntries(questions.map((q) => [q.id, 'teal']));
    },
  });
  const [log] = readdirSync(join(base, 'runs'));
  const lines = readFileSync(join(base, 'runs', log), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { code, lines, out };
}

function assertAskedAndUsed({ code, lines, out }: Awaited<ReturnType<typeof askRun>>) {
  assert.equal(code, 0, out.join('\n'));
  assert.ok(lines.some((l) => l.kind === 'question'), 'the agent asked');
  assert.ok(
    lines.some((l) => l.kind === 'event' && l.event.type === 'assistant_text' && /teal/i.test(l.event.text)),
    'the agent used the answer',
  );
}

for (const [adapter, model] of [
  ['claude-code', 'haiku'],
  ['opencode', OPENCODE_MODEL],
]) {
  test(`${adapter}: the agent asks and uses the answer`, live, async () => assertAskedAndUsed(await askRun(adapter, model)));
  test(`${adapter}: a question can wait six minutes`, slow, async () => assertAskedAndUsed(await askRun(adapter, model, 360_000)));
}

/** A run whose skill comes from a standalone `skills:` folder, as the owner's grill-me does. */
async function skillRun(adapter: string, model: string) {
  const base = mkdtempSync(join(tmpdir(), 'fb-skill-live-'));
  mkdirSync(join(base, 'proj'));
  mkdirSync(join(base, 'my-skills', 'echo'), { recursive: true });
  writeFileSync(
    join(base, 'my-skills', 'echo', 'SKILL.md'),
    '---\nname: echo\ndescription: Replies with a fixed token\n---\n\nReply with exactly: ECHO-OK\n',
  );
  writeFileSync(join(base, 'empty.md'), '');
  writeFileSync(
    join(base, 'task.yaml'),
    `adapter: ${adapter}\nmodel: ${model}\nfolder: proj\nprompt: empty.md\nskills: [my-skills/echo]\nskill: /echo\nlimits:\n  max_turns: 3\n  budget_usd: 0.2\n`,
  );
  const out: string[] = [];
  const code = await runAgent(['task.yaml'], { cwd: base, print: (l) => out.push(l), signals: new EventEmitter(), answer: async () => ({}) });
  return { code, out };
}

for (const [adapter, model] of [
  ['claude-code', 'haiku'],
  ['opencode', OPENCODE_MODEL],
]) {
  test(`${adapter}: a skills: folder is mounted and invoked`, live, async () => {
    const { code, out } = await skillRun(adapter, model);
    assert.equal(code, 0, out.join('\n'));
    assert.ok(out.some((l) => l.includes('ECHO-OK')), out.join('\n'));
  });
}
