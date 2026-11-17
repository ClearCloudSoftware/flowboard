/**
 * Whether this machine can run Lamproom's projects now: each system they use, probed through the same functions the
 * runs and the Settings pages use, graded by what the setup needs (`doctor-needs.ts`). Read-only, but for
 * `refreshOllama`, which keeps the model list it fetches as the Models page does. `lr-doctor` prints the report
 * (`doctor-cli.ts`); a page can return it as it is.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defaultDataDir } from './app-settings.ts';
import { defaultFlowsDir, doctorNeeds, type FlowNeed, type Need, readSetup } from './doctor-needs.ts';
import { type GhStatus, ghStatus } from './github.ts';
import { type HarnessStatus, harnessStatus } from './harnesses.ts';
import { boxImage } from './isolation.ts';
import { type OllamaState, refreshOllama } from './ollama.ts';
import { keyView, type KeyTest, savedKey, testKey } from './openrouter.ts';
import { dockerDefaultMemoryMb, dockerHasGvisor, dockerNotReady } from './project.ts';
import type { Harness, Trust } from './settings.ts';
import { type SlackAnswer, slackCall, slackTokens } from './slack.ts';

export type Status = 'ok' | 'warn' | 'fail' | 'skip';
export type Group = 'core' | 'container' | 'agents' | 'models' | 'connections';

export interface Check {
  id: string;
  group: Group;
  label: string;
  status: Status;
  needed: boolean;
  why: string;
  detail: string;
  fix?: string;
  version?: string;
  ms: number;
}

export interface DoctorReport {
  schema: 1;
  at: string;
  runner: 'terminal' | 'app';
  host: { platform: NodeJS.Platform; arch: string };
  context: {
    dataDir: string;
    flowsDir: string;
    defaultTrust: Trust;
    projects: { id: string; name: string; trust: Trust }[];
    flowNeeds: FlowNeed[];
    opensandboxFlows: string[];
    unreadableFlows: string[];
  };
  summary: { ok: number; warn: number; fail: number; skip: number; ready: boolean };
  checks: Check[];
}

export const CHECK_IDS = [
  'node', 'pnpm', 'git', 'data',
  'docker', 'docker.image', 'docker.gvisor', 'token.claude',
  'claude', 'opencode', 'uv',
  'openrouter', 'ollama',
  'github', 'slack', 'opensandbox',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export interface Probes {
  version(bin: string): Promise<{ ok: true; version: string } | { ok: false; missing: boolean; error: string }>;
  docker(): Promise<{ up: true; memoryMb?: number } | { up: false; error: string }>;
  image(name: string): Promise<{ created: string; sizeBytes: number } | null>;
  gvisor(): Promise<boolean>;
  harness(id: Harness, path: string | null): Promise<HarnessStatus>;
  openrouter(key: string): Promise<KeyTest>;
  ollama(dataDir: string): Promise<OllamaState>;
  gh(): Promise<GhStatus>;
  slack(bot: string): Promise<SlackAnswer>;
  reach(url: string): Promise<boolean>;
}

const exec = promisify(execFile);
const VERSION = /\d+\.\d+(?:\.\d+)?/;
const NOT_RUNNING = 'Docker is not running';

// ponytail: docker, gvisor and gh are the existing spawnSync probes: they block the parallel ones; make them async if the doctor gets slow
export const realProbes: Probes = {
  async version(bin) {
    try {
      const r = await exec(bin, ['--version'], { timeout: 10_000, env: { ...process.env, NO_COLOR: '1' } });
      const m = VERSION.exec(`${r.stdout} ${r.stderr}`);
      return m ? { ok: true, version: m[0] } : { ok: false, missing: false, error: `${bin} --version printed no version` };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      return { ok: false, missing: err.code === 'ENOENT', error: err.message.split('\n')[0] };
    }
  },
  async docker() {
    if (dockerNotReady(boxImage()) === NOT_RUNNING) return { up: false, error: NOT_RUNNING };
    const quarter = dockerDefaultMemoryMb(); // a step's default limit: a quarter of Docker's memory
    return { up: true, ...(quarter && { memoryMb: quarter * 4 }) };
  },
  async image(name) {
    try {
      const r = await exec('docker', ['image', 'inspect', '--format', '{{.Created}} {{.Size}}', name], { timeout: 10_000 });
      const [created, size] = r.stdout.trim().split(' ');
      return { created, sizeBytes: Number(size) };
    } catch {
      return null;
    }
  },
  gvisor: async () => dockerHasGvisor(),
  harness: harnessStatus,
  openrouter: (key) => testKey(key),
  ollama: (dataDir) => refreshOllama(dataDir),
  gh: async () => ghStatus(),
  slack: (bot) => slackCall(bot, 'auth.test'),
  async reach(url) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return true;
    } catch {
      return false;
    }
  },
};

export interface DoctorOptions {
  runner: 'terminal' | 'app';
  dataDir?: string;
  flowsDir?: string;
  env?: NodeJS.ProcessEnv;
  probes?: Partial<Probes>;
  timeoutMs?: number;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
}

/** What a probe found, before it is graded by the need: `degraded` works but warns; `skip` was not run. */
type Outcome = { health: 'ok' | 'degraded' | 'broken' | 'skip'; detail: string; fix?: string; version?: string };
interface Spec { group: Group; label: string; need: Need; why: string; run: () => Promise<Outcome> }

const ok = (detail: string, version?: string): Outcome => ({ health: 'ok', detail, ...(version && { version }) });
const broken = (detail: string, fix?: string): Outcome => ({ health: 'broken', detail, ...(fix && { fix }) });
const degraded = (detail: string, fix?: string): Outcome => ({ health: 'degraded', detail, ...(fix && { fix }) });
const skip = (detail: string): Outcome => ({ health: 'skip', detail });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function grade(need: Need, o: Outcome): Status {
  if (o.health === 'skip') return 'skip';
  if (o.health === 'ok') return 'ok';
  if (o.health === 'degraded') return 'warn';
  return need === 'yes' ? 'fail' : 'warn';
}

/** The `packageManager` pnpm major Lamproom pins, as `10`. */
function pinnedPnpm(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'), 'utf8')) as { packageManager?: string };
    return /^pnpm@(\d+)\./.exec(pkg.packageManager ?? '')?.[1];
  } catch {
    return undefined;
  }
}

export async function runDoctor(o: DoctorOptions): Promise<DoctorReport> {
  const env = o.env ?? process.env;
  const dataDir = o.dataDir ?? defaultDataDir();
  const flowsDir = o.flowsDir ?? defaultFlowsDir();
  const platform = o.platform ?? process.platform;
  const timeoutMs = o.timeoutMs ?? 30_000;
  const p: Probes = { ...realProbes, ...o.probes };
  const setup = readSetup(dataDir, flowsDir);
  const needs = doctorNeeds(setup);
  const notNeeded = (id: string) => skip(`not needed: ${needs.why[id]}`);

  /** A probe's outcome, or broken when it throws or takes longer than the timeout. */
  const timed = async (run: () => Promise<Outcome>): Promise<{ out: Outcome; ms: number }> => {
    const t0 = performance.now();
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<Outcome>((done) => {
      timer = setTimeout(() => done(broken(`did not answer in ${timeoutMs / 1000} s`)), timeoutMs);
    });
    const out = await Promise.race([run().catch((e: Error) => broken(`could not check: ${e.message.split('\n')[0]}`)), late]);
    clearTimeout(timer);
    return { out, ms: Math.round(performance.now() - t0) };
  };

  const tool = (bin: string, fix: string) => async (): Promise<Outcome> => {
    const v = await p.version(bin);
    return v.ok ? ok(v.version, v.version) : broken(v.missing ? 'not installed' : v.error, fix);
  };

  const dockerRun = timed(async () => {
    const v = await p.version('docker');
    if (!v.ok) return broken(v.missing ? 'not installed' : v.error, 'install Docker Desktop (Docker Engine on Linux)');
    const d = await p.docker();
    if (!d.up) return broken(d.error, platform === 'linux' ? 'start the Docker daemon' : 'Start Docker Desktop');
    return ok(`${v.version}${d.memoryMb ? `, ${(d.memoryMb / 1024).toFixed(1)} GB memory` : ''}`, v.version);
  });
  /** Why a check that needs Docker cannot run, or undefined when Docker is up. */
  const dockerDown = async () => {
    const { out } = await dockerRun;
    return out.health === 'ok' ? undefined : out.detail === 'not installed' ? 'Docker is not installed' : NOT_RUNNING;
  };

  const terminalNote = o.runner === 'terminal' ? '; checked in this terminal: the app opened from Finder or Explorer may not have it' : '';
  const orKey = env.OPENROUTER_API_KEY || savedKey(dataDir);
  const slack = slackTokens(dataDir);

  const specs: Record<CheckId, Spec> = {
    node: {
      group: 'core', label: 'node', need: 'yes', why: 'Lamproom and its CLIs run on it',
      run: async () => {
        const v = (o.nodeVersion ?? process.version).replace(/^v/, '');
        const [maj, min] = v.split('.').map(Number);
        if (maj < 22 || (maj === 22 && min < 18)) return broken(`${v}: too old to run Lamproom's TypeScript`, 'install Node 24');
        return maj < 24 ? { ...degraded(`${v}; Lamproom's image runs 24`, 'install Node 24'), version: v } : ok(v, v);
      },
    },
    pnpm: {
      group: 'core', label: 'pnpm', need: 'yes', why: "runs the app and the lr- scripts",
      run: async () => {
        const v = await p.version('pnpm');
        if (!v.ok) return broken(v.missing ? 'not installed' : v.error, 'corepack enable');
        const want = pinnedPnpm();
        return want && v.version.split('.')[0] !== want ? { ...degraded(`${v.version}; Lamproom pins pnpm ${want}`, 'corepack enable'), version: v.version } : ok(v.version, v.version);
      },
    },
    git: { group: 'core', label: 'git', need: 'yes', why: 'worktrees, clones and approvals', run: tool('git', 'install git') },
    data: {
      group: 'core', label: 'data', need: 'yes', why: `settings, projects and secrets: ${dataDir}`,
      run: async () => {
        if (setup.dataError) return broken(setup.dataError, 'fix the file by hand: Lamproom reads it whole');
        if (!existsSync(dataDir)) return degraded('no data folder yet; the app makes it on first start');
        try {
          accessSync(dataDir, constants.W_OK);
        } catch {
          return broken(`${dataDir} is not writable`);
        }
        return ok(plural(setup.projects.length, 'project'));
      },
    },
    docker: { group: 'container', label: 'Docker', need: needs.container, why: needs.why.docker, run: async () => (await dockerRun).out },
    'docker.image': {
      group: 'container', label: 'Image', need: needs.container, why: needs.why.docker,
      run: async () => {
        if (needs.container === 'no') return notNeeded('docker');
        const down = await dockerDown();
        if (down) return skip(down);
        const found = await Promise.all(needs.images.map(async (name) => ({ name, img: await p.image(name) })));
        const missing = found.filter((f) => !f.img).map((f) => f.name);
        if (missing.length) {
          const fix = missing.map((m) => (m === boxImage() ? `cd code/lamproom && docker build -f docker/Dockerfile -t ${m} .` : `build or pull ${m}`)).join('; ');
          return broken(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not built`, fix);
        }
        return ok(found.map((f) => `${f.name}, built ${f.img!.created.slice(0, 10)}, ${(f.img!.sizeBytes / 1e9).toFixed(2)} GB`).join('; '));
      },
    },
    'docker.gvisor': {
      group: 'container', label: 'gVisor', need: needs.gvisor, why: needs.why['docker.gvisor'],
      run: async () => {
        if (needs.gvisor === 'no') return notNeeded('docker.gvisor');
        const down = await dockerDown();
        if (down) return skip(down);
        if (await p.gvisor()) return ok('runsc is registered with Docker');
        return broken(platform === 'darwin' ? 'not available on macOS' : "Docker has no runsc runtime", 'set the Untrusted projects to Normal, or run them on Linux with gVisor');
      },
    },
    'token.claude': {
      group: 'container', label: 'Claude token', need: needs.tokenClaude, why: needs.why['token.claude'],
      run: async () => {
        if (needs.tokenClaude === 'no') return notNeeded('token.claude');
        const t = env.CLAUDE_CODE_OAUTH_TOKEN;
        const fix = 'claude setup-token, then export CLAUDE_CODE_OAUTH_TOKEN where Lamproom runs';
        if (!t) return broken(`CLAUDE_CODE_OAUTH_TOKEN is not set${terminalNote}`, fix);
        if (!t.startsWith('sk-ant-oat01-')) return broken(`CLAUDE_CODE_OAUTH_TOKEN is set but is not a claude setup-token token${terminalNote}`, fix);
        return ok(`set${terminalNote}`);
      },
    },
    claude: {
      group: 'agents', label: 'claude', need: needs.claude, why: needs.why.claude,
      run: async () => {
        const s = await p.harness('claude-code', setup.agents['claude-code'].path);
        if (!s.installed) return broken(s.error ?? 'not installed', 'install Claude Code, then run claude and log in');
        if (!s.signIn.ok) return { ...broken(s.signIn.text, 'run claude in a terminal and log in'), version: s.version };
        return ok(`${s.version}, ${s.signIn.text}`, s.version);
      },
    },
    opencode: {
      group: 'agents', label: 'opencode', need: needs.opencode, why: needs.why.opencode,
      run: async () => {
        const s = await p.harness('opencode', setup.agents.opencode.path);
        // Runs give OpenCode the OpenRouter key themselves (applySavedKey), so its own login decides nothing.
        return s.installed ? ok(`${s.version}, ${s.signIn.text}`, s.version) : broken(s.error ?? 'not installed', 'install OpenCode');
      },
    },
    uv: { group: 'agents', label: 'uv', need: needs.uv, why: needs.why.uv, run: tool('uv', 'install uv: docs.astral.sh/uv') },
    openrouter: {
      group: 'models', label: 'OpenRouter', need: needs.openrouter, why: needs.why.openrouter,
      run: async () => {
        if (!orKey) return needs.openrouter === 'no' ? notNeeded('openrouter') : broken('no key saved or exported', 'Settings → LLM Provider, or export OPENROUTER_API_KEY');
        const view = keyView(dataDir, env);
        const which = `${view.source} key …${view.last4}`;
        const r = await p.openrouter(orKey);
        if (!r.ok) return broken(`${which}: ${r.error}`, 'Settings → LLM Provider');
        return ok(`${which}, ${r.remainingUsd === null ? 'no credit limit' : `$${r.remainingUsd.toFixed(2)} left`}`);
      },
    },
    ollama: {
      group: 'models', label: 'Ollama', need: needs.ollama, why: needs.why.ollama,
      run: async () => {
        const s = await p.ollama(dataDir);
        if (s.error || !s.models) return broken(s.error ?? `Ollama does not answer on ${s.address}`, 'start Ollama');
        return ok(`${s.version ?? 'unknown version'}, ${plural(s.models.length, 'model')} on ${s.address}`, s.version ?? undefined);
      },
    },
    github: {
      group: 'connections', label: 'GitHub', need: 'no', why: 'the New Project wizard and clones',
      run: async () => {
        const s = await p.gh();
        if (s.state === 'connected') return ok(`connected as ${s.login}`);
        if (s.state === 'missing') return broken('gh is not installed', 'install the GitHub CLI, then gh auth login');
        if (s.state === 'signed-out') return broken('gh is not logged in', 'gh auth login');
        return broken(s.message, 'gh auth login');
      },
    },
    slack: {
      group: 'connections', label: 'Slack', need: 'no', why: 'escalation to Slack',
      run: async () => {
        if (!slack.bot && !slack.app) return skip('no tokens saved: escalation goes nowhere');
        if (!slack.bot) return degraded('no bot token: nothing gets posted', 'Settings → Connections');
        const a = await p.slack(slack.bot);
        if (!a.ok) return broken(`Slack refused the bot token: ${a.error}`, 'Settings → Connections');
        return slack.app ? ok('bot token accepted; app token set') : degraded("bot token accepted; no app token, so answers in Slack don't come back", 'Settings → Connections');
      },
    },
    opensandbox: {
      group: 'connections', label: 'OpenSandbox', need: needs.opensandbox, why: needs.why.opensandbox,
      run: async () => {
        if (needs.opensandbox === 'no') return notNeeded('opensandbox');
        const domain = env.OPENSANDBOX_DOMAIN ?? '127.0.0.1:8080';
        if (!(await p.reach(`http://${domain}/`))) return broken(`no answer on ${domain}`, 'start the OpenSandbox server (config in ~/.config/lamproom/opensandbox/)');
        const missing = (await Promise.all(needs.opensandboxImages.map(async (i) => ((await p.image(i)) ? [] : [i])))).flat();
        if (missing.length) return broken(`${missing.join(', ')} not built`, 'cd code/lamproom && docker build -f docker/Dockerfile.opensandbox -t lamproom:sandbox .');
        return ok(`answers on ${domain}`);
      },
    },
  };

  const results = await Promise.all(CHECK_IDS.map((id) => (id === 'docker' ? dockerRun : timed(specs[id].run))));
  const checks: Check[] = CHECK_IDS.map((id, i) => {
    const s = specs[id];
    const { out, ms } = results[i];
    const status = grade(s.need, out);
    const detail = status === 'warn' && out.health === 'broken' && s.need === 'no' ? `${out.detail} (optional)` : out.detail;
    return { id, group: s.group, label: s.label, status, needed: s.need === 'yes', why: s.why, detail, ...(out.fix && { fix: out.fix }), ...(out.version && { version: out.version }), ms };
  });
  const count = (st: Status) => checks.filter((c) => c.status === st).length;
  return {
    schema: 1,
    at: new Date().toISOString(),
    runner: o.runner,
    host: { platform, arch: process.arch },
    context: {
      dataDir,
      flowsDir,
      defaultTrust: setup.newProject.trust,
      projects: setup.projects.map(({ id, name, trust }) => ({ id, name, trust })),
      flowNeeds: [...new Set(setup.flows.flatMap((f) => f.needs))],
      opensandboxFlows: setup.flows.filter((f) => f.sandbox?.runtime === 'opensandbox').map((f) => f.name),
      unreadableFlows: setup.unreadableFlows,
    },
    summary: { ok: count('ok'), warn: count('warn'), fail: count('fail'), skip: count('skip'), ready: count('fail') === 0 },
    checks,
  };
}
