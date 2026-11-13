/** What the flows routes share: where the recipes are, and who may reach them. */
import { join, resolve } from 'node:path';
import { FLOW_NAME } from '../../../packages/cli/src/flow-files.ts';

/** `FLOWBOARD_FLOWS_DIR`, else `flows/` in the app's folder. */
export const flowsDir = () => (process.env.FLOWBOARD_FLOWS_DIR ? resolve(process.env.FLOWBOARD_FLOWS_DIR) : join(process.cwd(), 'flows'));

/** `FLOWBOARD_RUNS_DIR`, else `runs/` in the app's folder, where `pnpm run-flow` run there puts its run folders. */
export const runsDir = () => (process.env.FLOWBOARD_RUNS_DIR ? resolve(process.env.FLOWBOARD_RUNS_DIR) : join(process.cwd(), 'runs'));

/** `FLOWBOARD_DATA_DIR`, else `data/` in the app's folder: the project list, and the seeded scratch repo. */
export const dataDir = () => (process.env.FLOWBOARD_DATA_DIR ? resolve(process.env.FLOWBOARD_DATA_DIR) : join(process.cwd(), 'data'));

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * These routes read and write files on this machine, so they answer only requests addressed to it by name: a page
 * elsewhere that points its own name at 127.0.0.1 (DNS rebinding) is refused, and so is the network address. A write
 * must also come from FlowBoard's own pages: a browser sends a site's plain-text POST to localhost without asking
 * first, so one with another `Origin`, or that the browser marks as from another site, is refused (CSRF). Tools such
 * as curl send neither header.
 */
export function refused(request: Request): Response | undefined {
  const h = request.headers;
  const host = h.get('host') ?? '';
  if (!LOCAL.has(host.replace(/:\d+$/, ''))) return Response.json({ error: 'the flows API answers only on localhost' }, { status: 403 });
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const site = h.get('sec-fetch-site');
  const origin = h.get('origin');
  const foreign = (site !== null && site !== 'same-origin' && site !== 'none') || (origin !== null && origin !== `http://${host}` && origin !== `https://${host}`);
  return foreign ? Response.json({ error: 'only FlowBoard’s own pages may change things here' }, { status: 403 }) : undefined;
}

export const badName = (name: string) =>
  FLOW_NAME.test(name) ? undefined : Response.json({ error: `"${name}": a flow name may only use lowercase letters, digits, - and _` }, { status: 400 });

/** The JSON body, or undefined when it is not JSON. */
export const body = (request: Request): Promise<unknown> => request.json().catch(() => undefined);
