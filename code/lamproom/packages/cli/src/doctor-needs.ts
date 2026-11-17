/**
 * What this setup needs from the machine, before anything is probed: the trust of each project (and the one a new
 * project gets), and what the flows' agents and sandboxes use, the way `isolationFor` and `agentNeeds` see them. The
 * doctor (`doctor.ts`) turns each need into how a broken check counts: `yes` fails, `new` and `no` only warn.
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppSettings } from './app-settings.ts';
import { isDir } from './config.ts';
import { agentNeeds, loadFlow, NEEDS, type Sandbox } from './flow-config.ts';
import { boxImage } from './isolation.ts';
import { readProjects } from './projects.ts';
import { APP_DEFAULTS, type AppSettings, isLocal, type Knowledge, resolveSettings, TRUST, type Trust } from './settings.ts';

/** `new`: only the tier a new project gets needs it, so a broken one warns and never fails. */
export type Need = 'yes' | 'new' | 'no';
export type FlowNeed = keyof typeof NEEDS;

export interface Setup {
  projects: { id: string; name: string; trust: Trust; knowledge: Knowledge }[];
  newProject: { trust: Trust; knowledge: Knowledge };
  flows: { name: string; needs: FlowNeed[]; sandbox?: Sandbox }[];
  unreadableFlows: string[];
  localModelApproved: boolean;
  agents: AppSettings['agents'];
  dataDir: string;
  flowsDir: string;
  /** settings.json or projects.json did not parse: the defaults and no projects are used instead. */
  dataError?: string;
}

export interface Needs {
  container: Need;
  gvisor: Need;
  tokenClaude: Need;
  claude: Need;
  opencode: Need;
  uv: Need;
  openrouter: Need;
  ollama: Need;
  opensandbox: Need;
  /** Docker images to check, each once, Lamproom's own first. */
  images: string[];
  opensandboxImages: string[];
  /** Some run puts an OpenRouter step in a container, which gets only the key, never OpenCode's own login. */
  openrouterInBox: boolean;
  /** Check id → why it is needed, as shown beside it. */
  why: Record<string, string>;
}

/** The flows folder for the CLIs: `LAMPROOM_FLOWS_DIR`, else `flows/` in the app's folder (as `defaultDataDir`). */
export const defaultFlowsDir = () =>
  process.env.LAMPROOM_FLOWS_DIR ? resolve(process.env.LAMPROOM_FLOWS_DIR) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../flows');

const FLOW_NEEDS = Object.entries(NEEDS) as [FlowNeed, (typeof NEEDS)[FlowNeed]][];

export function readSetup(dataDir: string, flowsDir: string): Setup {
  let dataError: string | undefined;
  const read = <T>(file: string, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      dataError ??= `${join(dataDir, file)} does not parse: ${(e as Error).message}`;
      return fallback;
    }
  };
  const app = read('settings.json', () => readAppSettings(dataDir), APP_DEFAULTS);
  const projects = read('projects.json', () => readProjects(dataDir), []).map((p) => {
    const r = resolveSettings(app, p.type, p.overrides);
    return { id: p.id, name: p.name, trust: r.trust.value, knowledge: r.knowledge.value };
  });
  const fresh = resolveSettings(app, 'software', {}); // the New Project wizard's default type
  const flows: Setup['flows'] = [];
  const unreadableFlows: string[] = [];
  const names = isDir(flowsDir) ? readdirSync(flowsDir).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -'.yaml'.length)).sort() : [];
  for (const name of names) {
    const r = loadFlow(`${name}.yaml`, flowsDir);
    if (!r.ok) {
      unreadableFlows.push(name);
      continue;
    }
    const used = agentNeeds(r.config.steps);
    const needs = FLOW_NEEDS.filter(([, n]) => used.includes(n)).map(([k]) => k);
    flows.push({ name, needs, ...(r.config.sandbox && { sandbox: r.config.sandbox }) });
  }
  return {
    projects,
    newProject: { trust: fresh.trust.value, knowledge: fresh.knowledge.value },
    flows,
    unreadableFlows,
    localModelApproved: app.opencodeModels.some((m) => isLocal(m.id)),
    agents: app.agents,
    dataDir,
    flowsDir,
    ...(dataError && { dataError }),
  };
}

const label = (t: Trust) => TRUST[t].label;
const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(', ');
const are = (ps: { name: string }[], what: string) => `${names(ps)} ${ps.length === 1 ? 'is' : 'are'} ${what}`;

export function doctorNeeds(s: Setup, image = boxImage()): Needs {
  const newT = s.newProject.trust;
  const forNew = `needed for new projects (${label(newT)})`;
  const trusted = s.projects.filter((p) => p.trust === 'trusted');
  const boxed = s.projects.filter((p) => p.trust !== 'trusted');
  const untrusted = s.projects.filter((p) => p.trust === 'untrusted');
  const dockerFlows = s.flows.filter((f) => f.sandbox?.runtime === 'docker');
  const osbFlows = s.flows.filter((f) => f.sandbox?.runtime === 'opensandbox');
  const uses = (n: FlowNeed) => s.flows.some((f) => f.needs.includes(n));
  const by = (n: FlowNeed) => s.flows.filter((f) => f.needs.includes(n)).map((f) => f.name).join(', ');
  const why: Record<string, string> = {};

  const container: Need = boxed.length || dockerFlows.length ? 'yes' : newT !== 'trusted' ? 'new' : 'no';
  why.docker = [
    ...(boxed.length ? [`${are(boxed, 'Normal or Untrusted')}: their steps run in containers`] : []),
    ...dockerFlows.map((f) => `flow ${f.name} runs in ${f.sandbox!.image}`),
  ].join('; ') || (container === 'new' ? forNew : 'no project runs in containers');
  const images = [...new Set([...(boxed.length || newT !== 'trusted' ? [image] : []), ...dockerFlows.map((f) => f.sandbox!.image)])];

  const gvisor: Need = untrusted.length ? 'yes' : newT === 'untrusted' ? 'new' : 'no';
  why['docker.gvisor'] = untrusted.length ? `${are(untrusted, 'Untrusted')}: their containers run under gVisor` : gvisor === 'new' ? forNew : 'no Untrusted project';

  // As `isolate` (flow-run.ts) asks: a credential is needed in a container when a step that uses it runs in one.
  const inBox = (n: FlowNeed) => (boxed.length > 0 && uses(n)) || dockerFlows.some((f) => f.needs.includes(n));
  const tokenClaude: Need = inBox('claude') ? 'yes' : uses('claude') && newT !== 'trusted' ? 'new' : 'no';
  why['token.claude'] = tokenClaude === 'no' ? (uses('claude') ? 'no claude step runs in a container' : 'no flow uses claude') : `containers can't use this machine's claude login (flows: ${by('claude')})`;

  const host: Need = trusted.length ? 'yes' : newT === 'trusted' ? 'new' : 'no';
  const hostWhy = trusted.length ? `${are(trusted, 'Trusted')}: their agents run on this machine` : host === 'new' ? forNew : 'no Trusted project';
  const claude: Need = uses('claude') ? host : 'no';
  why.claude = uses('claude') ? hostWhy : 'no flow uses claude';
  const opencode: Need = uses('openrouter') || uses('ollama') ? host : 'no';
  why.opencode = uses('openrouter') || uses('ollama') ? hostWhy : 'no flow uses OpenCode';

  const knowing = trusted.filter((p) => p.knowledge.graphify || p.knowledge.serena);
  const newKnows = s.newProject.knowledge.graphify || s.newProject.knowledge.serena;
  const uv: Need = knowing.length ? 'yes' : newT === 'trusted' && newKnows ? 'new' : 'no';
  why.uv = knowing.length ? `${are(knowing, 'Trusted')} with knowledge assets on: built here with uvx` : uv === 'new' ? forNew : 'no Trusted project builds knowledge assets';

  // With no project yet, nothing runs a flow: what flows use is only needed for new projects.
  const some: Need = s.projects.length ? 'yes' : 'new';
  const openrouter: Need = uses('openrouter') ? some : 'no';
  why.openrouter = openrouter === 'yes' ? `flows ${by('openrouter')} use OpenRouter models` : 'no flow uses OpenRouter';
  const ollama: Need = uses('ollama') || s.localModelApproved ? some : 'no';
  why.ollama = uses('ollama') ? `flows ${by('ollama')} use local models` : s.localModelApproved ? 'a local model is approved for OpenCode' : 'no flow uses a local model';

  const opensandbox: Need = osbFlows.length ? 'yes' : 'no';
  why.opensandbox = osbFlows.length ? `flows ${names(osbFlows)} use runtime: opensandbox` : 'no flow uses runtime: opensandbox';
  const opensandboxImages = [...new Set(osbFlows.map((f) => f.sandbox!.image))];

  return { container, gvisor, tokenClaude, claude, opencode, uv, openrouter, ollama, opensandbox, images, opensandboxImages, openrouterInBox: inBox('openrouter'), why };
}
