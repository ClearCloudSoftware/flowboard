/**
 * A live flow in one OpenSandbox box: Claude Code and OpenCode write files, a shell check reads them, and the
 * host folder stays untouched until changes.patch is applied. Needs FLOWBOARD_LIVE=1, FLOWBOARD_OPENSANDBOX=1,
 * a server (OPENSANDBOX_DOMAIN, OPENSANDBOX_API_KEY), CLAUDE_CODE_OAUTH_TOKEN and OPENROUTER_API_KEY.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFlow } from '../src/flow-run.ts';

const live = { skip: !(process.env.FLOWBOARD_LIVE && process.env.FLOWBOARD_OPENSANDBOX === '1'), timeout: 600_000 };

test('a flow in an OpenSandbox box leaves the folder alone and hands back changes.patch', live, async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-osb-live-')));
  const proj = join(base, 'proj');
  mkdirSync(proj);
  writeFileSync(join(proj, 'README.md'), 'a project\n');
  const git = (...a: string[]) => execFileSync('git', ['-C', proj, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'base');
  writeFileSync(join(base, 'task.md'), 'Together, the steps of this flow write two small files into the current folder.');
  writeFileSync(join(base, 'claude.md'), 'Create the file claude.txt in the current folder containing exactly: written by claude in a box. Then write your notes artifact saying what you did.');
  writeFileSync(join(base, 'oc.md'), 'Create the file oc.txt in the current folder containing exactly: written by opencode in a box. Then write your notes artifact saying what you did.');
  writeFileSync(
    join(base, 'flow.yaml'),
    `budget_usd: 1
sandbox: { runtime: opensandbox, image: flowboard-sandbox }
defaults: { limits: { max_turns: 8, budget_usd: 0.3 }, permissions: { mode: acceptEdits } }
steps:
  claude: { adapter: claude-code, model: haiku, prompt: claude.md, produces: [claude_notes] }
  oc: { adapter: opencode, model: openrouter/deepseek/deepseek-v4.1-flash, prompt: oc.md, produces: [oc_notes] }
  check: { shell: 'cat claude.txt oc.txt', produces: [check_output] }
edges:
  - { from: claude, to: oc }
  - { from: oc, to: check }
`,
  );
  const out: string[] = [];
  const code = await runFlow(['--folder', 'proj', '--task', 'task.md', 'flow.yaml'], {
    cwd: base,
    print: (l) => out.push(l),
    printErr: (l) => out.push(l),
    signals: new EventEmitter(),
  });
  assert.equal(code, 0, out.join('\n'));
  assert.ok(!existsSync(join(proj, 'claude.txt')) && !existsSync(join(proj, 'oc.txt')), 'an agent wrote on this machine');
  const runs = join(base, 'runs');
  const run = join(runs, execFileSync('ls', [runs], { encoding: 'utf8' }).trim().split('\n')[0]!);
  const patch = readFileSync(join(run, 'changes.patch'), 'utf8');
  assert.match(patch, /\+\+\+ b\/claude\.txt/);
  assert.match(patch, /\+\+\+ b\/oc\.txt/);
  assert.doesNotMatch(patch, /\.flowboard\//);
  execFileSync('git', ['-C', proj, 'apply', '--check', join(run, 'changes.patch')]);
});
