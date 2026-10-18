import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DEFAULT_DENY_COMMANDS } from '@flowboard/core';
import { CLOSING, loadConfig } from '../src/config.ts';

/** A temp base dir holding proj/, task.md, plugins/fbecho/ and the given task.yaml. */
function project(yaml: string, prompt = 'Fix the bug.') {
  const base = mkdtempSync(join(tmpdir(), 'fb-cli-'));
  mkdirSync(join(base, 'proj'));
  mkdirSync(join(base, 'plugins', 'fbecho'), { recursive: true });
  writeFileSync(join(base, 'task.md'), prompt);
  writeFileSync(join(base, 'task.yaml'), yaml);
  return base;
}

const MINIMAL = 'adapter: claude-code\nmodel: sonnet\nfolder: proj\nprompt: task.md\n';

test('full YAML maps to the RunSpec', () => {
  const base = project(String.raw`
adapter: claude-code
model: sonnet
effort: high
folder: proj
prompt: task.md
system_prompt: Be careful.
plugins: [plugins/fbecho]
skill: /fbecho:echo
permissions:
  mode: dontAsk
  allow: [Read, "Bash(pnpm *)"]
  deny: [WebFetch]
guards:
  deny_paths: [docs/**]
  deny_commands: ['\bnpm\s+publish\b']
limits:
  budget_usd: 0.5
  max_turns: 20
`);
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.adapter, 'claude-code');
  assert.equal(r.config.yamlPath, join(base, 'task.yaml'));
  assert.deepEqual(r.config.spec, {
    model: 'sonnet',
    effort: 'high',
    cwd: join(base, 'proj'),
    prompt: { preamble: 'Fix the bug.', inputs: [], outputs: [], invocation: '/fbecho:echo', closing: CLOSING },
    systemPrompt: 'Be careful.',
    capabilities: [{ id: 'fbecho', provider: 'claude-code', mount: { kind: 'plugin_dir', path: join(base, 'plugins/fbecho') } }],
    permissionMode: 'dontAsk',
    toolPolicy: { allow: ['Read', 'Bash(pnpm *)'], deny: ['WebFetch'] },
    guards: {
      writeRoots: [join(base, 'proj')],
      denyPaths: ['docs/**'],
      denyCommands: [...DEFAULT_DENY_COMMANDS, String.raw`\bnpm\s+publish\b`],
    },
    limits: { maxBudgetUsd: 0.5, maxTurns: 20 },
  });
  assert.equal(r.config.unrestrictedShell, false);
});

test('minimal YAML gets the defaults', () => {
  const base = project(MINIMAL);
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  const { spec } = r.config;
  assert.equal(spec.permissionMode, 'acceptEdits');
  assert.deepEqual(spec.guards, { writeRoots: [join(base, 'proj')], denyCommands: DEFAULT_DENY_COMMANDS });
  for (const key of ['effort', 'systemPrompt', 'capabilities', 'toolPolicy', 'limits']) assert.ok(!(key in spec), key);
  assert.equal(spec.prompt.invocation, undefined);
});

test('absolute paths are used as written', () => {
  const elsewhere = mkdtempSync(join(tmpdir(), 'fb-cli-abs-'));
  const base = project(MINIMAL.replace('folder: proj', `folder: ${elsewhere}`));
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.spec.cwd, elsewhere);
});

test('a leading ~ expands to the home directory', (t) => {
  const inHome = mkdtempSync(join(homedir(), '.fb-cli-home-'));
  t.after(() => rmSync(inHome, { recursive: true }));
  const base = project(MINIMAL.replace('folder: proj', `folder: ~/${basename(inHome)}`));
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.spec.cwd, inHome);
});
