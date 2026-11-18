/**
 * Jira REST transport — implements McpTransport but calls the Jira Cloud REST
 * API instead of Atlassian's Rovo MCP server.
 *
 * Rovo MCP currently refuses third-party OAuth apps with
 * "We couldn't verify your access. Reconnecting and signing in again may
 * resolve this issue."  That channel is reserved for approved Rovo partner
 * apps. For now (personal Atlassian sites, Lamproom's own dev builds),
 * direct REST is the working path.
 *
 * The shape this transport serves is the SAME envelope Rovo would return:
 *   { content: [{ type: 'text', text: '<JSON string of search result>' }] }
 * so `JiraTaskSource` + `normalize.ts` see no difference. When Rovo opens up
 * to third parties, swap `restTransport` for `httpTransport` and nothing
 * else needs to change.
 *
 * Only the `searchJiraIssuesUsingJql` tool is implemented. Other tools throw.
 */

import type { McpTransport, McpToolDescriptor } from '../../mcp/client.ts';

export interface RestTransportOptions {
  /** `cdcc7ae5-01a2-43f7-a1fa-83290443d4bb` style UUID for OAuth; or hostname/URL for API-token. */
  cloudId: string;
  /** Authorization header value — `Bearer <oauth>` or `Basic <base64(email:token)>`. */
  authorization: string;
  /** Fetch impl for tests. */
  fetchFn?: typeof fetch;
}

interface JiraSearchArgs {
  cloudId?: string;
  jql: string;
  maxResults?: number;
  nextPageToken?: string;
  fields?: string[];
}

export function restTransport(opts: RestTransportOptions): McpTransport {
  const fetchFn = opts.fetchFn ?? fetch;
  // When the operator stored a hostname (API-token path), hit the hostname directly.
  // When they stored a UUID (OAuth path), use Atlassian's gateway.
  const base = isUuid(opts.cloudId)
    ? `https://api.atlassian.com/ex/jira/${opts.cloudId}`
    : `https://${opts.cloudId.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  return {
    async callTool(name, args, signal) {
      if (name !== 'searchJiraIssuesUsingJql') {
        throw new Error(`jira REST transport: tool '${name}' not supported; only searchJiraIssuesUsingJql`);
      }
      const a = args as unknown as JiraSearchArgs;
      const body = {
        jql: a.jql,
        maxResults: a.maxResults ?? 50,
        ...(a.nextPageToken !== undefined ? { nextPageToken: a.nextPageToken } : {}),
        ...(a.fields !== undefined ? { fields: a.fields } : {}),
      };
      const response = await fetchFn(`${base}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          Authorization: opts.authorization,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        ...(signal !== undefined ? { signal } : {}),
      });
      if (!response.ok) {
        const text = (await response.text().catch(() => '')).slice(0, 500);
        const err = new Error(`jira REST search returned ${response.status}: ${text}`);
        (err as Error & { status?: number }).status = response.status;
        throw err;
      }
      const result = (await response.json()) as JiraRestSearchResult;
      // Normalise REST shape into what normalize.ts expects:
      //  - description: ADF object → plain-text string (lossy but sufficient
      //    for ticket bodies; a later plan can wire a proper ADF->markdown
      //    converter)
      //  - parent: absent → null
      //  - nextPageToken naming preserved
      const normalisedIssues = (result.issues ?? []).map((issue) => ({
        key: issue.key,
        fields: {
          ...issue.fields,
          description: adfToText(issue.fields?.description) ?? null,
          parent: issue.fields?.parent ?? null,
          assignee: issue.fields?.assignee ?? null,
        },
      }));
      const envelopePayload = {
        issues: normalisedIssues,
        ...(result.nextPageToken !== undefined ? { nextPageToken: result.nextPageToken } : {}),
      };
      return { content: [{ type: 'text', text: JSON.stringify(envelopePayload) }] };
    },
    async listTools(): Promise<McpToolDescriptor[]> {
      return [{ name: 'searchJiraIssuesUsingJql', description: 'Search Jira issues via REST (REST fallback)' }];
    },
    async close() {
      // No persistent connection to close.
    },
  };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

interface JiraRestSearchResult {
  issues?: Array<{
    key: string;
    fields?: Record<string, unknown> & { description?: unknown; parent?: unknown; assignee?: unknown };
  }>;
  nextPageToken?: string;
}

/** Minimal ADF-to-text. Walks `content[]`, concatenates text leaves, joins paragraphs with blank lines. */
function adfToText(adf: unknown): string | null {
  if (adf === null || adf === undefined) return null;
  if (typeof adf === 'string') return adf;
  if (typeof adf !== 'object') return String(adf);
  const paragraphs: string[] = [];
  walk(adf as AdfNode, paragraphs, []);
  const out = paragraphs.join('\n\n').trim();
  return out === '' ? null : out;
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

function walk(node: AdfNode, paragraphs: string[], buffer: string[]): void {
  if (node.type === 'text' && typeof node.text === 'string') {
    buffer.push(node.text);
    return;
  }
  if (node.type === 'hardBreak') {
    buffer.push('\n');
    return;
  }
  if (!Array.isArray(node.content)) return;
  const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock']);
  if (node.type !== undefined && blockTypes.has(node.type)) {
    const local: string[] = [];
    for (const child of node.content) walk(child, paragraphs, local);
    const joined = local.join('').trim();
    if (joined !== '') paragraphs.push(joined);
    return;
  }
  for (const child of node.content) walk(child, paragraphs, buffer);
}
