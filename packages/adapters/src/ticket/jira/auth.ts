/**
 * Jira auth helpers — error class and token redaction.
 *
 * Separated from provider.ts so tests can import the error class without
 * pulling in the MCP transport and the OAuth loopback machinery.
 */

export class CredentialMissingError extends Error {
  readonly sourceId: string;
  readonly projectId: string;
  constructor(sourceId: string, projectId: string) {
    super(`no credentials configured for source '${sourceId}' and project '${projectId}'`);
    this.name = 'CredentialMissingError';
    this.sourceId = sourceId;
    this.projectId = projectId;
  }
}

/**
 * Replace every occurrence of each token in `message` with `[redacted]`.
 * Accepts a variable number of tokens because OAuth paths carry two
 * (access + refresh) and the Basic path carries one (API token). Undefined
 * and empty strings are skipped.
 *
 * Substring replacement is the only safe approach here — regex-matching
 * on a token format (`eyJ.*\..*\..*` for JWTs, `ATATT3xFfGF0.*` for
 * Atlassian API tokens) would miss OAuth access tokens that don't look
 * like JWTs, or fail when Atlassian changes their prefix. The adapter has
 * the actual token string in memory; use it.
 */
export function redactTokens(message: string, ...tokens: Array<string | undefined>): string {
  let out = message;
  for (const token of tokens) {
    if (token !== undefined && token !== '') {
      out = out.split(token).join('[redacted]');
    }
  }
  return out;
}
