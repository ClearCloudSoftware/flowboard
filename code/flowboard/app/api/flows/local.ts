/** What the flows routes share: where the recipes are, and who may reach them. */
import { join, resolve } from 'node:path';
import { FLOW_NAME } from '../../../packages/cli/src/flow-files.ts';

/** `FLOWBOARD_FLOWS_DIR`, else `flows/` in the app's folder. */
export const flowsDir = () => (process.env.FLOWBOARD_FLOWS_DIR ? resolve(process.env.FLOWBOARD_FLOWS_DIR) : join(process.cwd(), 'flows'));

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * These routes read and write files on this machine, so they answer only requests addressed to it by name: a page
 * elsewhere that points its own name at 127.0.0.1 (DNS rebinding) is refused, and so is the network address.
 */
export function refused(request: Request): Response | undefined {
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
  if (LOCAL.has(host)) return undefined;
  return Response.json({ error: 'the flows API answers only on localhost' }, { status: 403 });
}

export const badName = (name: string) =>
  FLOW_NAME.test(name) ? undefined : Response.json({ error: `"${name}": a flow name may only use lowercase letters, digits, - and _` }, { status: 400 });

/** The JSON body, or undefined when it is not JSON. */
export const body = (request: Request): Promise<unknown> => request.json().catch(() => undefined);
