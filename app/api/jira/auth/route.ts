/**
 * DELETE /api/jira/auth
 *
 * Clears the stored Jira credential. defaultJql is kept.
 */

import { clearJiraCredential } from '../../../../packages/cli/src/jira.ts';
import { dataDir, refused } from '../../flows/local.ts';

export async function DELETE(request: Request) {
  const no = refused(request);
  if (no) return no;
  clearJiraCredential(dataDir());
  return Response.json({ ok: true });
}
