/**
 * GET /api/jira/auth/status
 *
 * Returns which auth is configured (none / OAuth / API token) and the
 * non-secret details for the UI to display: siteName + expiresAt for OAuth,
 * baseUrl + email for API token. Never returns the token itself.
 */

import { jiraStatus } from '../../../../../packages/cli/src/jira.ts';
import { dataDir, refused } from '../../../flows/local.ts';

export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;
  return Response.json(jiraStatus(dataDir()));
}
