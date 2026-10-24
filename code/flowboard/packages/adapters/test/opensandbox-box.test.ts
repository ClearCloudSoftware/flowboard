/**
 * Live: needs an OpenSandbox server (see code/flowboard/docker/README.md) and FLOWBOARD_OPENSANDBOX=1,
 * OPENSANDBOX_DOMAIN and OPENSANDBOX_API_KEY. Skipped otherwise.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectBox, openBox } from '../src/exec/opensandbox/box.ts';
import type { Box } from '../src/exec/opensandbox/box.ts';

const skip = process.env.FLOWBOARD_OPENSANDBOX !== '1' && 'set FLOWBOARD_OPENSANDBOX=1 with a server running';
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' });

let folder: string;
let box: Box;

/** stdout and exit code of one process in the box. */
function run(c: ChildProcessWithoutNullStreams): Promise<{ out: string; code: number | null; error?: Error }> {
  c.stdin.end();
  let out = '';
  let error: Error | undefined;
  c.stdout.on('data', (d) => (out += d));
  c.stderr.on('data', (d) => (out += d));
  c.on('error', (e) => (error = e));
  return new Promise((r) => c.on('close', (code) => r({ out: out.trim(), code, error })));
}
const sh = (script: string, b = box) => run(b.exec({}).spawn('sh', ['-c', script], { cwd: folder }));

before(async () => {
  if (skip) return;
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'fb-box-')));
  git(folder, 'init', '-q');
  writeFileSync(join(folder, 'a.txt'), 'committed\n');
  git(folder, 'add', '-A');
  git(folder, 'commit', '-qm', 'base');
  writeFileSync(join(folder, 'b.txt'), 'not committed\n');
  box = await openBox({ image: 'flowboard-sandbox', folder, egress: ['api.anthropic.com'], credentials: ['CLAUDE_CODE_OAUTH_TOKEN'], timeoutSeconds: 900 });
});
after(async () => {
  if (!skip) await box?.kill().catch(() => {});
});

test("a box holds the folder's last commit, not its uncommitted edits", { skip }, async () => {
  assert.deepEqual(await sh('cat a.txt; test -e b.txt && echo b-present || echo b-absent'), { out: 'committed\nb-absent', code: 0, error: undefined });
});

test('a step exec runs in the folder as uid 1000 and cannot reach the Mac', { skip }, async () => {
  const r = await sh(`pwd; id -u; node -e "fetch('http://host.docker.internal').then(()=>console.log('reached'),()=>console.log('blocked'))"`);
  assert.deepEqual(r.out.split('\n'), [folder, '1000', 'blocked']);
});

test('the real key stays outside', { skip }, async () => {
  assert.equal((await sh('echo "$CLAUDE_CODE_OAUTH_TOKEN" | cut -c1-16')).out, 'sk-ant-oat01-000');
});

test('a step gets the files its exec pushes, and pullFiles brings back only the files named', { skip }, async () => {
  const art = realpathSync(mkdtempSync(join(tmpdir(), 'fb-art-')));
  writeFileSync(join(art, 'plan.md'), 'the plan');
  const exec = box.exec({ push: () => [join(art, 'plan.md')] });
  const r = await run(exec.spawn('sh', ['-c', `cat ${art}/plan.md && echo "the notes" > ${art}/notes.md && echo other > ${art}/other.md`], { cwd: folder }));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, 'the plan');
  await box.pullFiles([join(art, 'notes.md'), join(art, 'missing.md')]);
  assert.equal(readFileSync(join(art, 'notes.md'), 'utf8'), 'the notes\n');
  assert.ok(!existsSync(join(art, 'other.md')), 'a file not asked for came back');
});

test('pullFiles never brings back a link, and never reads as root', { skip }, async () => {
  const art = realpathSync(mkdtempSync(join(tmpdir(), 'fb-art-')));
  await box.pushDir(art);
  // An agent swaps its output for a link to a root-only file, and another to the whole filesystem.
  const r = await run(box.exec({}).spawn('sh', ['-c', `ln -s /etc/shadow ${art}/notes.md && ln -s / ${art}/all.md`], { cwd: folder }));
  assert.equal(r.code, 0, r.out);
  const started = Date.now();
  await box.pullFiles([join(art, 'notes.md'), join(art, 'all.md')]);
  assert.ok(Date.now() - started < 30_000, 'the pull walked the box');
  assert.ok(!existsSync(join(art, 'notes.md')) && !existsSync(join(art, 'all.md')), 'a link or its target came back');
});

test('patch keeps a deleted file and a binary file', { skip }, async () => {
  const r = await sh(`rm a.txt && printf '\\001\\377\\000' > bin.dat && printf 'caf\\351\\n' > latin.txt`);
  assert.equal(r.code, 0, r.out);
  const patch = await box.patch();
  const clone = realpathSync(mkdtempSync(join(tmpdir(), 'fb-clone-')));
  execFileSync('git', ['clone', '-q', folder, clone]);
  assert.ok(Buffer.isBuffer(patch), 'the patch must stay bytes: a text file in Latin-1 is not UTF-8');
  execFileSync('git', ['-C', clone, 'apply', '--check', '-'], { input: patch });
  execFileSync('git', ['-C', clone, 'apply', '-'], { input: patch });
  assert.ok(!existsSync(join(clone, 'a.txt')));
  assert.deepEqual([...readFileSync(join(clone, 'bin.dat'))], [1, 255, 0]);
  assert.deepEqual([...readFileSync(join(clone, 'latin.txt'))], [0x63, 0x61, 0x66, 0xe9, 0x0a]);
});

test('connectBox finds a live box and refuses a gone one', { skip }, async () => {
  const again = await connectBox(box.id, { folder, token: box.token });
  assert.equal((await sh('echo again', again)).out, 'again');
  const other = await openBox({ image: 'flowboard-sandbox', folder, egress: [], credentials: [], timeoutSeconds: 300 });
  await other.kill();
  await assert.rejects(connectBox(other.id, { folder, token: other.token }), new RegExp(`sandbox ${other.id} is gone`));
});

test('a step whose box was killed ends with an error', { skip }, async () => {
  const doomed = await openBox({ image: 'flowboard-sandbox', folder, egress: [], credentials: [], timeoutSeconds: 300 });
  const c = doomed.exec({}).spawn('sleep', ['30'], { cwd: folder });
  const ended = run(c);
  await new Promise((r) => setTimeout(r, 1500));
  await doomed.kill();
  const r = await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no end in 10 s')), 10_000))]);
  assert.ok(r.error, 'no error emitted');
  assert.match(r.error!.message, new RegExp(doomed.id));
});

