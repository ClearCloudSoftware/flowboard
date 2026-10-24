/**
 * One OpenSandbox sandbox per flow run: it holds the folder's last commit at the folder's own path, runs
 * every step through a relay (relay.cjs), lets out only `egress`, and injects the real credentials on
 * the way out while the box holds fakes. See docs/FlowBoard/Sandboxing/OpenSandbox Spike.md.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  /** An ExecHost for one step; `tmpDir` and `fresh` are copied in before every process, `mounts` once per box. */
  exec(o: { tmpDir?: string; mounts?: string[]; fresh?: string[] }): ExecHost;
  /** Copies a host folder into the box at the same path, over what is there (parallel steps share the box). */
  pushDir(dir: string): Promise<void>;
  /** Copies a box folder back to the host at the same path: new and changed files only. */
  pullDir(dir: string): Promise<void>;
  /** `git diff --binary` of the folder against the commit it started from, new files included. */
  patch(): Promise<string>;
  kill(): Promise<void>;
}

const RELAY = fileURLToPath(new URL('./relay.cjs', import.meta.url));
/** code/flowboard on this machine; the flowboard-cli image keeps the same tree at /opt/flowboard. */
const FLOWBOARD_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
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
async function root(sb: Sandbox, script: string): Promise<void> {
  const ex = await sb.commands.run(script, { uid: 0, gid: 0 }); // a string: this server version takes no argv array
  const out = ex.logs.stdout.map((m) => m.text).join('') + ex.logs.stderr.map((m) => m.text).join('');
  if (ex.exitCode !== 0) throw new Error(`sandbox ${sb.id}: ${script.split('\n')[0]}: exit ${ex.exitCode}: ${out.trim()}`);
}

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
  return {
    id: sb.id,
    token,
    missing,
    exec({ tmpDir, mounts = [], fresh = [] }) {
      const prepare = async () => {
        if (tmpDir) await pushDir(tmpDir); // the provider writes its files there just before it spawns
        for (const d of fresh) await pushDir(d);
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
    async pullDir(dir) {
      // -h: an agent's symlink comes back as the file it names in the box, never as a link on this machine.
      const tgz = `/tmp/fb-down-${randomBytes(6).toString('hex')}.tgz`;
      await root(sb, `mkdir -p ${q(dir)} && tar -czhf ${tgz} -C ${q(dir)} .`);
      const data = Buffer.from(await sb.files.readBytes(tgz));
      await root(sb, `rm -f ${tgz}`);
      execFileSync('mkdir', ['-p', dir]);
      execFileSync('tar', ['-xzf', '-', '-C', dir], { input: data });
    },
    async patch() {
      const g = `git -C ${q(folder)} -c safe.directory=* -c core.quotePath=false`; // root reading the image user's repo
      // Through a file: the command API hands output back as messages that lose their newlines.
      const file = `/tmp/fb-patch-${randomBytes(6).toString('hex')}`;
      await root(sb, `${g} add -A && ${g} diff --binary --cached ${BASE_TAG} > ${file}`);
      const patch = Buffer.from(await sb.files.readBytes(file)).toString('utf8');
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
