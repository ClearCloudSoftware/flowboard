/**
 * One OpenSandbox sandbox per flow run: it holds the folder's last commit at the folder's own path, runs
 * every step through a relay (relay.cjs), lets out only `egress`, and injects the real credentials on
 * the way out while the box holds fakes. See docs/FlowBoard/Sandboxing/OpenSandbox Spike.md.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sandbox } from '@alibaba-group/opensandbox';
import type { ExecHost } from '@flowboard/core';
import { relayExecHost } from './relay-host.ts';

export interface BoxOptions {
  image: string;
  folder: string;
  egress: string[];
  /** Names of this machine's env variables to inject on the way out; the box gets a fake of each. */
  credentials: string[];
  timeoutSeconds: number;
}

export interface Box {
  id: string;
  /** The relay's token: with `id`, what --resume needs to reach this box again. */
  token: string;
  /** Credentials named in the options but not set on this machine. */
  missing: string[];
  /** An ExecHost for one step; `tmpDir` and the files `push` names are copied in before every process, `mounts` once per box. */
  exec(o: { tmpDir?: string; mounts?: string[]; push?: () => string[] }): ExecHost;
  /** Copies a host folder into the box at the same path, over what is there (parallel steps share the box). */
  pushDir(dir: string): Promise<void>;
  /**
   * Copies these files back from the box to the same paths here: regular files only, read as the box's user.
   * A file the box lacks, or holds as a link, stays as it is here.
   */
  pullFiles(files: string[]): Promise<void>;
  /** `git diff --binary` of the folder against the commit it started from, new files included; bytes, as git wrote them. */
  patch(): Promise<Buffer>;
  kill(): Promise<void>;
}

const RELAY = fileURLToPath(new URL('./relay.cjs', import.meta.url));
/** code/flowboard on this machine; the flowboard-cli image keeps the same tree at /opt/flowboard. */
// A plain path, not `new URL('../…', import.meta.url)`: bundlers (Next's Turbopack) read that as an asset import.
const FLOWBOARD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const IN_IMAGE = '/opt/flowboard';
const RELAY_PORT = 7000;
const RELAY_IN_BOX = '/tmp/flowboard-relay.cjs';
const BASE_TAG = 'flowboard-base';
/** The uid the image's user has; the box's files must be theirs. */
const USER = '1000:1000';

/** Credentials the box knows by name: the host that gets the real value, and a fake of the right shape. */
const KNOWN: Record<string, { host: string; fake: string }> = {
  CLAUDE_CODE_OAUTH_TOKEN: { host: 'api.anthropic.com', fake: `sk-ant-oat01-${'0'.repeat(86)}` },
  OPENROUTER_API_KEY: { host: 'openrouter.ai', fake: `sk-or-v1-${'0'.repeat(64)}` },
};

const connectionConfig = () => ({
  domain: process.env.OPENSANDBOX_DOMAIN ?? '127.0.0.1:8080',
  apiKey: process.env.OPENSANDBOX_API_KEY,
  protocol: 'http' as const,
  requestTimeoutSeconds: 120, // the first create pulls the egress image; the SDK's 30 s gives up first
});

/** Runs a shell command in the box as root (the image must leave its user root: docker/Dockerfile.opensandbox). */
async function root(sb: Sandbox, script: string, uid = 0): Promise<void> {
  const ex = await sb.commands.run(script, { uid, gid: uid }); // a string: this server version takes no argv array
  const out = ex.logs.stdout.map((m) => m.text).join('') + ex.logs.stderr.map((m) => m.text).join('');
  if (ex.exitCode !== 0) throw new Error(`sandbox ${sb.id}: ${script.split('\n')[0]}: exit ${ex.exitCode}: ${out.trim()}`);
}

const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function upload(sb: Sandbox, data: Buffer): Promise<string> {
  const path = `/tmp/fb-up-${randomBytes(6).toString('hex')}.tgz`;
  await sb.files.writeFiles([{ path, data }]);
  return path;
}

/** A gzip'd tar of `dir` with no macOS attributes (Linux tar warns about each). */
const tarOf = (dir: string) =>
  execFileSync('tar', ['--no-mac-metadata', '-czf', '-', '-C', dir, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 1 << 30 });

async function startRelay(sb: Sandbox, token: string) {
  await sb.files.writeFiles([{ path: RELAY_IN_BOX, data: readFileSync(RELAY) }]);
  // As uid 1000: every process the relay starts is the image user's, never root.
  await sb.commands.run(`node ${RELAY_IN_BOX}`, { background: true, uid: 1000, gid: 1000, envs: { RELAY_PORT: String(RELAY_PORT), RELAY_TOKEN: token, HOME: '/tmp' } });
}

async function relayUp(sb: Sandbox): Promise<boolean> {
  try {
    const { url, headers } = await reach(sb, RELAY_PORT);
    return (await fetch(url, { headers }).then((r) => r.text())) === 'relay';
  } catch {
    return false;
  }
}

async function reach(sb: Sandbox, port: number): Promise<{ url: string; headers?: Record<string, string> }> {
  const ep = await sb.getEndpoint(port);
  return { url: ep.endpoint.startsWith('http') ? ep.endpoint : `http://${ep.endpoint}`, ...(ep.headers && { headers: ep.headers }) };
}

async function waitFor(cond: () => Promise<boolean>, what: string, ms = 20_000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`${what} did not come up in ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function boxOf(sb: Sandbox, folder: string, token: string, missing: string[]): Box {
  const name = `sandbox ${sb.id}`;
  const pushed = new Set<string>();
  const pushDir = async (dir: string) => {
    const tgz = await upload(sb, tarOf(dir));
    // Merged, never replaced: another step running in this box may be writing there.
    await root(sb, `mkdir -p ${q(dir)} && tar -xzf ${tgz} -C ${q(dir)} && rm ${tgz} && chown -R ${USER} ${q(dir)}`);
  };
  /** Files from here to the same paths in the box, owned by its user. */
  const pushFiles = async (files: string[]) => {
    const rel = files.map((f) => f.replace(/^\//, ''));
    const data = execFileSync('tar', ['--no-mac-metadata', '-czf', '-', '-C', '/', ...rel], { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 1 << 30 });
    const tgz = await upload(sb, data);
    const dirs = [...new Set(files.map((f) => dirname(f)))];
    await root(sb, `tar -xzf ${tgz} -C / && rm ${tgz} && chown ${USER} ${dirs.map(q).join(' ')} ${files.map(q).join(' ')}`);
  };
  return {
    id: sb.id,
    token,
    missing,
    exec({ tmpDir, mounts = [], push }) {
      const prepare = async () => {
        if (tmpDir) await pushDir(tmpDir); // the provider writes its files there just before it spawns
        const files = push?.() ?? [];
        if (files.length) await pushFiles(files);
        for (const m of mounts.filter((m) => !pushed.has(m))) {
          await pushDir(m);
          pushed.add(m);
        }
      };
      const host = relayExecHost({
        connect: () => reach(sb, RELAY_PORT),
        token,
        name,
        profile: { tier: 'container', egressAllow: [] },
        ...(tmpDir && { tmpDir }),
        mapPath: (p) => (p.startsWith(`${FLOWBOARD_ROOT}/`) ? IN_IMAGE + p.slice(FLOWBOARD_ROOT.length) : p),
        beforeSpawn: prepare,
      });
      return {
        ...host,
        exists: async (path) => {
          const info = await sb.files.getFileInfo([path]).catch(() => undefined);
          return !!info?.[path];
        },
        endpoint: (port) => reach(sb, port),
        // The tunnel's socket lives in tmpDir, which must exist in the box first.
        tunnel: async (boxSocket, hostSocket) => {
          await prepare();
          return host.tunnel!(boxSocket, hostSocket);
        },
      };
    },
    pushDir,
    async pullFiles(files) {
      if (!files.length) return;
      const tag = randomBytes(6).toString('hex');
      const [list, tgz] = [`/tmp/fb-list-${tag}`, `/tmp/fb-down-${tag}.tgz`];
      // As the box's user, regular files only: an agent's link to /etc/shadow or to / is never read as root.
      const tests = files.map((f) => `[ -f ${q(f)} ] && [ ! -L ${q(f)} ] && printf '%s\\n' ${q(f.replace(/^\//, ''))}`).join('; ');
      await root(sb, `cd / && { ${tests}; true; } > ${list} && tar -czf ${tgz} -C / -T ${list}`, 1000);
      const data = Buffer.from(await sb.files.readBytes(tgz));
      await root(sb, `rm -f ${list} ${tgz}`);
      // Unpacked apart, then only regular files copied into place: whatever the archive holds, no link lands here.
      const scratch = mkdtempSync(join(tmpdir(), 'fb-pull-'));
      try {
        execFileSync('tar', ['-xzf', '-', '-C', scratch, '--no-same-owner'], { input: data });
        for (const f of files) {
          const got = join(scratch, f.replace(/^\//, ''));
          if (!existsSync(got) || !lstatSync(got).isFile()) continue;
          mkdirSync(dirname(f), { recursive: true });
          if (existsSync(f) || isLink(f)) rmSync(f, { force: true }); // never written through a link
          copyFileSync(got, f);
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    async patch() {
      const g = `git -C ${q(folder)} -c safe.directory=* -c core.quotePath=false`; // root reading the image user's repo
      // Through a file: the command API hands output back as messages that lose their newlines.
      const file = `/tmp/fb-patch-${randomBytes(6).toString('hex')}`;
      await root(sb, `${g} add -A && ${g} diff --binary --cached ${BASE_TAG} > ${file}`);
      const patch = Buffer.from(await sb.files.readBytes(file)); // never decoded: a file in Latin-1 is not UTF-8
      await root(sb, `rm -f ${file}`);
      return patch;
    },
    async kill() {
      await sb.kill();
    },
  };
}

export async function openBox(o: BoxOptions): Promise<Box> {
  const known = o.credentials.filter((c) => KNOWN[c]);
  const missing = known.filter((c) => !process.env[c]);
  const present = known.filter((c) => process.env[c]);
  const sb = await Sandbox.create({
    connectionConfig: connectionConfig(),
    image: o.image,
    timeoutSeconds: o.timeoutSeconds,
    env: { HOME: '/tmp', ...Object.fromEntries(known.map((c) => [c, KNOWN[c]!.fake])) },
    networkPolicy: { defaultAction: 'deny', egress: o.egress.map((target) => ({ action: 'allow' as const, target })) },
    credentialProxy: { enabled: true },
    metadata: { flowboard: 'run' },
  });
  try {
    if (present.length) {
      await sb.credentialVault.create({
        credentials: present.map((c) => ({ name: c.toLowerCase(), source: { value: process.env[c]! } })),
        bindings: present.map((c) => ({ name: c.toLowerCase(), match: { schemes: ['https' as const], hosts: [KNOWN[c]!.host] }, auth: { type: 'bearer' as const, credential: c.toLowerCase() } })),
      });
    }
    const tgz = await upload(sb, execFileSync('git', ['-C', o.folder, 'archive', '--format=tar.gz', 'HEAD'], { maxBuffer: 1 << 30 }));
    const g = `git -C ${q(o.folder)} -c user.email=flowboard@sandbox -c user.name=flowboard`;
    await root(
      sb,
      `mkdir -p ${q(o.folder)} && tar -xzf ${tgz} -C ${q(o.folder)} && rm ${tgz} && ${g} init -q && ${g} add -A && ${g} commit -qm base --allow-empty && ${g} tag ${BASE_TAG} && echo .flowboard/ >> ${q(o.folder)}/.git/info/exclude && chown -R ${USER} ${q(o.folder)}`,
    );
    const token = randomBytes(24).toString('hex');
    await startRelay(sb, token);
    await waitFor(() => relayUp(sb), `the relay in sandbox ${sb.id}`);
    return boxOf(sb, o.folder, token, missing);
  } catch (e) {
    await sb.kill().catch(() => {});
    throw e;
  }
}

/** The box a paused run left; its relay is started again if the box restarted. Throws `sandbox <id> is gone`. */
export async function connectBox(id: string, o: { folder: string; token: string }): Promise<Box> {
  let sb: Sandbox;
  try {
    sb = await Sandbox.connect({ sandboxId: id, connectionConfig: connectionConfig(), readyTimeoutSeconds: 15 });
    const { status } = await sb.getInfo();
    if (status.state !== 'Running') throw new Error(status.state);
  } catch {
    throw new Error(`sandbox ${id} is gone`);
  }
  if (!(await relayUp(sb))) {
    await startRelay(sb, o.token);
    await waitFor(() => relayUp(sb), `the relay in sandbox ${id}`);
  }
  return boxOf(sb, o.folder, o.token, []);
}
