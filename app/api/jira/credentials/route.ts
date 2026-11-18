/**
 * POST /api/jira/credentials
 *
 * Save the API-token credential (the Basic-auth path). Validates URL is
 * https, email and token are non-empty. Returns the same shape as
 * /api/jira/auth/status.
 */

import { z } from 'zod';
import { jiraStatus, readJira, writeJira } from '../../../../packages/cli/src/jira.ts';
import { body, dataDir, refused } from '../../flows/local.ts';

const Input = z.object({
  baseUrl: z
    .string()
    .trim()
    .refine((s) => s.startsWith('https://'), 'baseUrl must start with https://'),
  email: z.string().trim().email(),
  token: z.string().trim().min(1, 'token is required'),
  defaultJql: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  const parsed = Input.safeParse(await body(request));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  }
  const current = readJira(dataDir());
  writeJira(dataDir(), {
    ...current,
    credential: {
      kind: 'atlassian_api_token',
      baseUrl: parsed.data.baseUrl,
      email: parsed.data.email,
      token: parsed.data.token,
    },
    ...(parsed.data.defaultJql !== undefined && parsed.data.defaultJql !== ''
      ? { defaultJql: parsed.data.defaultJql }
      : {}),
  });
  return Response.json(jiraStatus(dataDir()));
}
