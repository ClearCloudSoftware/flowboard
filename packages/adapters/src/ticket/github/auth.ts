/**
 * GitHub auth error types and redaction helpers.
 *
 * Separated from provider.ts so tests can import the error class without
 * pulling in the Octokit SDK.
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
 * Replace every occurrence of `token` in `message` with `[redacted]`.
 *
 * The only safe redactor is substring replacement with the actual token,
 * because the adapter has it in memory. Regex-matching on `ghp_` patterns
 * wouldn't catch GitHub App installation tokens or OAuth tokens, both of
 * which look different.
 */
export function redactToken(message: string, token: string | undefined): string {
  if (token === undefined || token === '') return message;
  return message.split(token).join('[redacted]');
}
