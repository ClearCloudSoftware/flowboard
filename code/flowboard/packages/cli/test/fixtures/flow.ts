/** Flow files and a temp project for the run-flow tests. */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const DELIVERY = `
folder: proj
task: task.md
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  plan: { prompt: prompts/plan.md, produces: [plan], gate: approval }
  implement: { prompt: prompts/implement.md, requires: [plan], produces: [notes] }
  tests:
    adapter: opencode
    model: openrouter/deepseek/deepseek-v4.1-flash
    prompt: prompts/tests.md
    requires: [plan]
    produces: [test_notes]
    write_roots: [tests]
  check: { shell: pnpm test, produces: [check_output] }
  review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], max_attempts: 2 }
edges:
  - { from: plan, to: implement }
  - { from: plan, to: tests }
  - { from: implement, to: check }
  - { from: tests, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail }
  - { from: review, to: implement, condition: on_fail }
`;

/** A temp base holding proj/, task.md, prompts/<name>.md (each holding its name), flow.yaml and `extra` (path → text). */
export function flowProject(yaml: string, extra: Record<string, string> = {}): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-flow-'))); // macOS's temp folder is a link
  mkdirSync(join(base, 'proj'));
  mkdirSync(join(base, 'prompts'));
  writeFileSync(join(base, 'task.md'), 'Build it.');
  for (const n of ['plan', 'implement', 'tests', 'review', 'x', 'a', 'c', 'd']) writeFileSync(join(base, 'prompts', `${n}.md`), n);
  writeFileSync(join(base, 'flow.yaml'), yaml);
  for (const [path, text] of Object.entries(extra)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), text);
  }
  return base;
}
