/**
 * Where a run works, decided by its project's trust (`settings.ts`): the project's tier is the floor, and a flow's
 * own `sandbox:` may only keep it or make it stronger (host < docker = opensandbox < gVisor).
 */
import { realpathSync } from 'node:fs';
import { z } from 'zod';
import type { Sandbox } from './flow-config.ts';
import { LimitsSchema } from './project.ts';
import { owns, readProjects } from './projects.ts';
import type { Project } from './projects.ts';
import type { Trust } from './settings.ts';

/**
 * Pinned with a run: the project it ran for, that project's trust then, and what the run got for it. `flowSandbox`:
 * the flow's own `sandbox:`, which `--resume` makes the run's sandbox from again to check the pin.
 */
export interface Isolation { projectId: string; trust: Trust; tier: (typeof TIERS)[number]; approvals: boolean; flowSandbox?: Sandbox }

const TIERS = ['host', 'container', 'gvisor', 'opensandbox'] as const;
/** A pinned `Sandbox`, as `--resume` reads it back from a flow.json an agent may have written. */
export const SandboxSchema = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('docker'), image: z.string().min(1), env: z.array(z.string()), limits: LimitsSchema.optional(), gvisor: z.literal(true).optional() }),
  z.strictObject({ runtime: z.literal('opensandbox'), image: z.string().min(1), egress: z.array(z.string()), credentials: z.array(z.string()), limits: LimitsSchema.optional() }),
]);
/** A pinned `Isolation`, likewise. */
export const IsolationSchema = z.strictObject({
  projectId: z.string(),
  trust: z.enum(['trusted', 'normal', 'untrusted']),
  tier: z.enum(TIERS),
  approvals: z.boolean(),
  flowSandbox: SandboxSchema.optional(),
});

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
  // A runtime neither of these is no box at all: the run's steps would work on this machine.
  const runtime: string | undefined = flow?.runtime;
  if (runtime !== undefined && runtime !== 'docker' && runtime !== 'opensandbox') return { refused: `sandbox: no runtime ${runtime}; a run works in docker or opensandbox` };
  const own = (sb: Sandbox) => ({ sandbox: sb, tier: sb.runtime === 'docker' ? ('container' as const) : ('opensandbox' as const), approvals: false });
  const box: Sandbox = { runtime: 'docker', image: IMAGE, env: needs };
  if (trust === 'trusted') return flow ? own(flow) : { tier: 'host', approvals: true };
  if (trust === 'normal') return own(flow ?? box);
  if (flow?.runtime === 'opensandbox') return { refused: "Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor" };
  if (!gvisor) return { refused: "Untrusted runs need gVisor, and this machine's Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor" };
  // The box gets the agents' credentials only: a flow's sandbox.env could copy any of this machine's variables in.
  return { sandbox: { ...(flow ?? box), env: needs, gvisor: true }, tier: 'gvisor', approvals: false };
}
