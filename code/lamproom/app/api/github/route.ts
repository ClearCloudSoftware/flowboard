import { connection } from 'next/server';
import { GH_REQUEST_ACCESS_URL, ghOwners, ghStatus } from '../../../packages/cli/src/github.ts';
import { refused } from '../flows/local.ts';

/**
 * Who the installed `gh` is logged in as, with the account's owners (itself, then its organizations) once it is;
 * `requestAccessUrl`: where a member asks an organization to let the GitHub CLI in.
 */
export async function GET(request: Request) {
  await connection();
  const no = refused(request);
  if (no) return no;
  const status = ghStatus();
  if (status.state !== 'connected') return Response.json({ status, requestAccessUrl: GH_REQUEST_ACCESS_URL });
  const owners = ghOwners();
  return Response.json({ status, requestAccessUrl: GH_REQUEST_ACCESS_URL, ...(owners.ok ? { owners: owners.owners } : { error: owners.error }) });
}
