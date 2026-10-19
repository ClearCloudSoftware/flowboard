import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DEFAULT_DENY_COMMANDS } from '@flowboard/core';
import { CLOSING, configFromObject, loadConfig, readYaml } from '../src/config.ts';

/** A temp base dir holding proj/, task.md, plugins/fbecho/ and the given task.yaml. */
function project(yaml: string, prompt = 'Fix the bug.') {
  // Real path: macOS's temp folder is a link, and loadConfig resolves folders to real paths.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-cli-')));
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
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'fb-cli-abs-')));
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

// --- validation ---------------------------------------------------------

const SHELL_TAIL = 'lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it';

/** Load `yaml` from a fresh project and return the error lines (fails the test if it loaded). */
function errorsOf(yaml: string, prompt?: string) {
  const base = project(yaml, prompt);
  const r = loadConfig('task.yaml', base);
  assert.ok(!r.ok, 'expected errors');
  return { errors: r.errors, base };
}

test('a missing YAML file is reported', () => {
  const r = loadConfig('nope.yaml', project(MINIMAL));
  assert.deepEqual(r, { ok: false, errors: ['nope.yaml: file: not found'] });
});

test('a YAML syntax error is reported', () => {
  const { errors } = errorsOf('adapter: [claude-code\n');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^task\.yaml: syntax: \S/);
});

test('an empty file, a list or a scalar must be a mapping', () => {
  for (const yaml of ['', '- a\n- b\n', 'hello\n']) {
    assert.deepEqual(errorsOf(yaml).errors, ['task.yaml: (root): must be a mapping'], JSON.stringify(yaml));
  }
});

test('unknown keys are named, nested ones by their path', () => {
  assert.deepEqual(errorsOf(MINIMAL + 'colour: red\n').errors, ['task.yaml: colour: unknown key']);
  assert.deepEqual(errorsOf(MINIMAL + 'permissions:\n  mood: calm\n').errors, ['task.yaml: permissions.mood: unknown key']);
});

test('a missing required field is reported', () => {
  assert.deepEqual(errorsOf(MINIMAL.replace('model: sonnet\n', '')).errors, ['task.yaml: model: required']);
});

test('enum fields reject unknown values', () => {
  assert.match(errorsOf(MINIMAL.replace('claude-code', 'codex')).errors.join('\n'), /^task\.yaml: adapter: /);
  assert.match(errorsOf(MINIMAL + 'effort: extreme\n').errors.join('\n'), /^task\.yaml: effort: /);
  assert.match(errorsOf(MINIMAL + 'permissions:\n  mode: yolo\n').errors.join('\n'), /^task\.yaml: permissions\.mode: /);
});

test('limits must be positive', () => {
  assert.match(errorsOf(MINIMAL + 'limits:\n  budget_usd: -1\n').errors.join('\n'), /^task\.yaml: limits\.budget_usd: /);
  assert.match(errorsOf(MINIMAL + 'limits:\n  max_turns: 1.5\n').errors.join('\n'), /^task\.yaml: limits\.max_turns: /);
});

test('folder and plugins must be directories', () => {
  const a = errorsOf(MINIMAL.replace('folder: proj', 'folder: nope'));
  assert.deepEqual(a.errors, [`task.yaml: folder: not a directory: ${join(a.base, 'nope')}`]);
  const b = errorsOf(MINIMAL + 'plugins: [plugins/fbecho, plugins/nope]\n');
  assert.deepEqual(b.errors, [`task.yaml: plugins.1: not a directory: ${join(b.base, 'plugins/nope')}`]);
});

test('prompt must be a file', () => {
  const { errors, base } = errorsOf(MINIMAL.replace('prompt: task.md', 'prompt: nope.md'));
  assert.deepEqual(errors, [`task.yaml: prompt: not a file: ${join(base, 'nope.md')}`]);
});

test('a blank prompt with no skill is reported', () => {
  assert.deepEqual(errorsOf(MINIMAL, '  \n').errors, ['task.yaml: prompt: file is empty']);
});

test('a blank prompt is fine when a skill is set', () => {
  const r = loadConfig('task.yaml', project(MINIMAL + 'skill: /fbecho:echo\n', ''));
  assert.ok(r.ok, JSON.stringify(r));
});

test('skill must start with /', () => {
  assert.deepEqual(errorsOf(MINIMAL + 'skill: echo\n').errors, ['task.yaml: skill: must start with "/"']);
});

test('an opencode model needs a provider prefix', () => {
  const yaml = MINIMAL.replace('claude-code', 'opencode').replace('sonnet', 'deepseek');
  assert.deepEqual(errorsOf(yaml).errors, ['task.yaml: model: opencode model must be "providerID/modelID"']);
});

test('deny_commands must compile as regexes', () => {
  const { errors } = errorsOf(MINIMAL + "guards:\n  deny_commands: ['ok', '(']\n");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^task\.yaml: guards\.deny_commands\.1: invalid regex: \S/);
});

test('several file-system problems are reported together', () => {
  const { errors } = errorsOf(MINIMAL.replace('folder: proj', 'folder: nope').replace('prompt: task.md', 'prompt: nope.md'));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^task\.yaml: folder: /);
  assert.match(errors[1], /^task\.yaml: prompt: /);
});

test('bypassPermissions without the opt-in is refused', () => {
  assert.deepEqual(errorsOf(MINIMAL + 'permissions:\n  mode: bypassPermissions\n').errors, [
    `task.yaml: permissions.mode: bypassPermissions ${SHELL_TAIL}`,
  ]);
});

test('auto mode, "Bash" and "bash(*)" each need the opt-in', () => {
  assert.deepEqual(errorsOf(MINIMAL + 'permissions:\n  mode: auto\n').errors, [`task.yaml: permissions.mode: auto ${SHELL_TAIL}`]);
  assert.deepEqual(errorsOf(MINIMAL + 'permissions:\n  allow: [Read, Bash]\n').errors, [
    `task.yaml: permissions.allow: "Bash" ${SHELL_TAIL}`,
  ]);
  assert.deepEqual(errorsOf(MINIMAL + 'permissions:\n  allow: ["bash(*)"]\n').errors, [
    `task.yaml: permissions.allow: "bash(*)" ${SHELL_TAIL}`,
  ]);
});

test('wildcard-only Bash patterns also need the opt-in', () => {
  for (const entry of ['Bash(:*)', 'Bash(**)', 'Bash(*:*)', 'Bash( * )', 'Bash ']) {
    assert.deepEqual(errorsOf(MINIMAL + `permissions:\n  allow: ["${entry}"]\n`).errors, [
      `task.yaml: permissions.allow: "${entry}" ${SHELL_TAIL}`,
    ], entry);
  }
});

test('bypassPermissions with the opt-in loads and flags unrestrictedShell', () => {
  const r = loadConfig('task.yaml', project(MINIMAL + 'permissions:\n  mode: bypassPermissions\n  allow_unrestricted_shell: true\n'));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.unrestrictedShell, true);
});

test('"Bash(pnpm *)" needs no opt-in', () => {
  const r = loadConfig('task.yaml', project(MINIMAL + 'permissions:\n  allow: ["Bash(pnpm *)"]\n'));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.unrestrictedShell, false);
});

// --- closing line and skills: ----------------------------------------------

test('the closing line tells the agent to ask through the tool', () => {
  assert.equal(
    CLOSING,
    'You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop.',
  );
});

/** Adds skills/<folder>/SKILL.md to `base` with the given frontmatter name (none when null). */
function addSkill(base: string, folder: string, name: string | null = folder) {
  mkdirSync(join(base, 'skills', folder), { recursive: true });
  const front = name === null ? '' : `---\nname: ${name}\ndescription: test\n---\n`;
  writeFileSync(join(base, 'skills', folder, 'SKILL.md'), `${front}Ask the user things.\n`);
}

test('skills: entries load and a plain skill name becomes /local:<name>', () => {
  const base = project(MINIMAL + 'skills: [skills/grill-me]\nskill: /grill-me\n');
  addSkill(base, 'grill-me');
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(r.config.skills, [{ name: 'grill-me', path: join(base, 'skills/grill-me') }]);
  assert.equal(r.config.spec.prompt.invocation, '/local:grill-me');
});

test('no skills: means an empty list', () => {
  const r = loadConfig('task.yaml', project(MINIMAL));
  assert.ok(r.ok);
  assert.deepEqual(r.config.skills, []);
});

test('a skills: entry must be a directory', () => {
  const { errors, base } = errorsOf(MINIMAL + 'skills: [skills/nope]\n');
  assert.deepEqual(errors, [`task.yaml: skills.0: not a directory: ${join(base, 'skills/nope')}`]);
});

test('a skills: entry needs a SKILL.md', () => {
  const base = project(MINIMAL + 'skills: [skills/empty]\n');
  mkdirSync(join(base, 'skills', 'empty'), { recursive: true });
  const r = loadConfig('task.yaml', base);
  assert.deepEqual(r, { ok: false, errors: [`task.yaml: skills.0: no SKILL.md in ${join(base, 'skills/empty')}`] });
});

test('SKILL.md must have a name', () => {
  const base = project(MINIMAL + 'skills: [skills/x]\n');
  addSkill(base, 'x', null);
  assert.deepEqual(loadConfig('task.yaml', base), { ok: false, errors: ['task.yaml: skills.0: SKILL.md has no name'] });
});

test('the SKILL.md name must match the folder', () => {
  const base = project(MINIMAL + 'skills: [skills/x]\n');
  addSkill(base, 'x', 'other');
  assert.deepEqual(loadConfig('task.yaml', base), {
    ok: false,
    errors: ['task.yaml: skills.0: SKILL.md name "other" does not match folder "x"'],
  });
});

test('two skills with the same name are refused', () => {
  const base = project(MINIMAL + 'skills: [skills/x, more/x]\n');
  addSkill(base, 'x');
  mkdirSync(join(base, 'more', 'x'), { recursive: true });
  writeFileSync(join(base, 'more', 'x', 'SKILL.md'), '---\nname: x\n---\n');
  assert.deepEqual(loadConfig('task.yaml', base), { ok: false, errors: ['task.yaml: skills.1: duplicate skill name "x"'] });
});

test('a plain skill name must be one of the skills', () => {
  assert.deepEqual(errorsOf(MINIMAL + 'skill: /grill-me\n').errors, ['task.yaml: skill: no skill "grill-me" in skills']);
});

test('a plugin folder named local clashes with skills:', () => {
  const base = project(MINIMAL + 'plugins: [plugins/local]\nskills: [skills/x]\n');
  mkdirSync(join(base, 'plugins', 'local'));
  addSkill(base, 'x');
  assert.deepEqual(loadConfig('task.yaml', base), {
    ok: false,
    errors: ['task.yaml: plugins.0: plugin folder name "local" is reserved for skills'],
  });
});

// --- links resolve to real paths --------------------------------------------

test('a folder reached through a link resolves to its real path', () => {
  const real = mkdtempSync(join(tmpdir(), 'fb-cli-real-'));
  const base = project(MINIMAL.replace('folder: proj', 'folder: link'));
  symlinkSync(real, join(base, 'link'));
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.spec.cwd, realpathSync(real));
  assert.deepEqual(r.config.spec.guards?.writeRoots, [realpathSync(real)]);
});

test('a plugin reached through a link resolves to its real path', () => {
  const target = mkdtempSync(join(tmpdir(), 'fb-cli-plugin-'));
  const base = project(MINIMAL + 'plugins: [plink]\n');
  symlinkSync(target, join(base, 'plink'));
  const r = loadConfig('task.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  const mount = r.config.spec.capabilities?.[0].mount;
  assert.ok(mount?.kind === 'plugin_dir');
  assert.equal(mount.path, realpathSync(target));
});

test('a missing folder is still a plain error line', () => {
  const { errors, base } = errorsOf(MINIMAL.replace('folder: proj', 'folder: nope'));
  assert.deepEqual(errors, [`task.yaml: folder: not a directory: ${join(base, 'nope')}`]);
});

const asRoot = process.getuid?.() === 0; // root reads anything, so permission tests cannot fail

test('an unreadable prompt file is an error line', { skip: asRoot }, () => {
  const base = project(MINIMAL);
  chmodSync(join(base, 'task.md'), 0o000);
  const r = loadConfig('task.yaml', base);
  assert.ok(!r.ok);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^task\.yaml: prompt: cannot read: \S/);
});

test('configFromObject checks a parsed mapping the way loadConfig checks a file', () => {
  const base = project(MINIMAL);
  const fromFile = loadConfig('task.yaml', base);
  const fromObject = configFromObject({ adapter: 'claude-code', model: 'sonnet', folder: 'proj', prompt: 'task.md' }, base);
  assert.ok(fromFile.ok && fromObject.ok);
  assert.deepEqual(fromObject.config.spec, fromFile.config.spec);
  assert.deepEqual(configFromObject({ adapter: 'claude-code', folder: 'proj', prompt: 'task.md' }, base), { ok: false, errors: ['model: required'] });
});

test('readYaml reports file problems with the path as typed', () => {
  const base = project(MINIMAL);
  assert.deepEqual(readYaml('nope.yaml', base), { ok: false, errors: ['nope.yaml: file: not found'] });
});
