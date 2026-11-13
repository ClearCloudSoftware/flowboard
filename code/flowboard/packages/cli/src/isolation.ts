/**
 * Where a run works, decided by its project's trust (`settings.ts`): the project's tier is the floor, and a flow's
 * own `sandbox:` may only keep it or make it stronger (host < docker = opensandbox < gVisor).
 */
import { realpathSync } from 'node:fs';
import type { Sandbox } from './flow-config.ts';
import { owns, readProjects } from './projects.ts';
import type { Project } from './projects.ts';
import type { Trust } from './settings.ts';

/**
 * Pinned with a run: the project it ran for, that project's trust then, and what the run got for it. `flowSandbox`:
 * the flow's own `sandbox:`, which `--resume` makes the run's sandbox from again to check the pin.
 */
export interface Isolation { projectId: string; trust: Trust; tier: 'host' | 'container' | 'gvisor' | 'opensandbox'; approvals: boolean; flowSandbox?: Sandbox }

/** The image `docker/Dockerfile` builds: a flow without its own `sandbox:` runs in it. */
const IMAGE = 'flowboard-cli';

/** The project whose repo holds `folder`, a link or a task worktree under it included. */
export function findProject(dataDir: string, folder: string): Project | undefined {
  let real: string;
  try {
    real = realpathSync(folder);
  } catch {
    return undefined; // gone
  }
  return readProjects(dataDir).find((p) => owns(p, real));
}

/**
 * The sandbox a run gets at `trust` for a flow asking for `flow`, or why it may not run. `needs`: the credential
 * variables the flow's agents need, which a box made for it passes in; `gvisor`: Docker here has runsc.
 */
export function isolationFor(
  trust: Trust,
  flow: Sandbox | undefined,
  needs: string[],
  gvisor: boolean,
): { sandbox?: Sandbox; tier: Isolation['tier']; approvals: boolean } | { refused: string } {
  const own = (sb: Sandbox) => ({ sandbox: sb, tier: sb.runtime === 'docker' ? ('container' as const) : ('opensandbox' as const), approvals: false });
  const box: Sandbox = { runtime: 'docker', image: IMAGE, env: needs };
  if (trust === 'trusted') return flow ? own(flow) : { tier: 'host', approvals: true };
  if (trust === 'normal') return own(flow ?? box);
  if (flow?.runtime === 'opensandbox') return { refused: "Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor" };
  if (!gvisor) return { refused: "Untrusted runs need gVisor, and this machine's Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor" };
  // The box gets the agents' credentials only: a flow's sandbox.env could copy any of this machine's variables in.
  return { sandbox: { ...(flow ?? box), env: needs, gvisor: true }, tier: 'gvisor', approvals: false };
}
