# Jira TaskSource via Atlassian Rovo MCP — design

Date: 2026-11-17. Branch: `feature/task-source-jira-mcp`, branched from `feature/task-source-port`. Builds on the TaskSource port and GitHub adapter shipped in [the preceding plan](../plans/2026-11-14-task-source-port-markdown-and-github.md).

## Intent

Lamproom needs a Jira ingestion path that is **production-grade on day one**: real OAuth, real audit trail, the same adapter boundary as GitHub, no Docker sidecar, no short-term shortcuts. Jira is the backlog of record at most enterprises; shipping a weak Jira adapter means losing every enterprise conversation at the first question.

The path is the **official Atlassian Rovo MCP Server v2** (`https://mcp.atlassian.com/v2/mcp`), connected over **Streamable HTTP** using `@modelcontextprotocol/sdk` v2. Two auth modes supported from day one:

- **OAuth 2.1** with PKCE, loopback redirect, refresh — the primary path for interactive operators.
- **Atlassian API token** (email + token) — the power-user / CI fallback.

Rovo MCP returns Jira issue bodies already converted to markdown, so the ADF → markdown problem does not land on Lamproom. Rovo is Cloud-only; Jira Server / Data Center is deferred to a later plan that uses `sooperset/mcp-atlassian` as a different adapter.

## Goals

- `JiraTaskSource` behind the existing `TaskSource` port. Same three-file split as `GithubTaskSource` (`options.ts`, `normalize.ts`, `provider.ts`) plus `auth.ts`, `oauth.ts`.
- A thin `McpClient` wrapper in `@lamproom/adapters/src/mcp/` that `JiraTaskSource` consumes. Reusable for later MCP-backed adapters (Linear MCP, Confluence MCP, Compass MCP — Rovo v2 already covers these but we ship one at a time).
- Two new `SourceCredentials` kinds: `atlassian_oauth` and `atlassian_api_token`. `EnvFileCredentialResolver` learns them.
- `/settings/connections/tasks/jira` settings page with two tabs: "Sign in with Atlassian" (OAuth) and "API token" (manual). Preview button fetches first page of issues via the adapter and renders a table.
- `GET /api/jira/preview` route exercises the adapter server-side.
- OAuth loopback flow at `/api/jira/auth/start` + `/api/jira/auth/callback`, with PKCE and `state` CSRF protection.
- Tokens stored in Lamproom's existing `settings.json` (encrypted at rest? — see Open Questions #3), with automatic refresh before expiry.
- Live tests (`FLOWBOARD_LIVE=1`) covering the OAuth path and the API token path.

## Non-goals

- Writing to Jira (`jira_create_issue`, `jira_update_issue`, `jira_transition_issue`). Read-only in this plan; writes land in a follow-up.
- Confluence, Bitbucket, JSM, Loom, Compass — Rovo v2 exposes them, this adapter uses the Jira subset only.
- Jira Server / Data Center. Rovo is Cloud-only; a `sooperset`-backed adapter lands in its own plan.
- Webhook ingest (Jira webhook → Lamproom). The `ingest()` method on the port stays unimplemented for Jira in this plan.
- Full ADF handling in Lamproom code. Rovo returns markdown. If a later adapter needs ADF (sooperset without the markdown filter), it handles conversion itself.
- JQL builder / UI JQL editor. The settings page accepts one default JQL string; the preview uses it. An editor is a follow-up.
- Database upsert. The preview endpoint returns `ParsedTask[]` in the HTTP response for display; nothing writes to `tasks` table (which does not exist yet).
- Project-page "import these issues into this Lamproom project" wizard. Settings-page preview only in this plan.

## Anti-goals

- Any code path that disables PKCE or `state` verification "for testing." Both are required always.
- Any OAuth client secret shipped with Lamproom. Lamproom is a local-first public client; it uses PKCE and no secret. Baking a secret is a security incident.
- Any path that bypasses `redactToken` for Atlassian tokens. OAuth access tokens, refresh tokens and API tokens are all redacted from error paths.
- Any `fetch()` that runs before the credential resolver returns a valid credential. Credential-missing → `CredentialMissingError`, no network call (same rule as GitHub).
- Any MCP client call without a deadline. The MCP SDK v2 supports `requestInit.signal`; every call carries an `AbortSignal` bounded by a timeout. A hung Rovo call must not hang Lamproom.
- Any plaintext of the token in logs, ever. Even in `console.debug`. Even in dev.

## Constraints

- Same code rules as the providers: TypeScript run by Node 24 type stripping (erasable syntax only, `import type`, `.ts` relative imports), `node:test` + `node:assert/strict` only, commands from the repo root.
- `@lamproom/core` still carries **no runtime dependencies**; the MCP SDK and OAuth plumbing land in `@lamproom/adapters`.
- `@modelcontextprotocol/sdk` is pinned to its current v2 stable (`^1.33.0` family — the v2-split package line; exact version fixed in the plan).
- Live tests require either a real Atlassian API token (CI-friendly) or a completed OAuth session (developer-friendly). Both lanes present, both gated on `FLOWBOARD_LIVE=1`.

## The MCP client wrapper

Lives at `packages/adapters/src/mcp/`. Three files:

- `client.ts` — the `McpClient` class. Thin wrapper around `@modelcontextprotocol/sdk` client. Methods: `listTools()`, `callTool(name, args, { signal })`, `close()`. Never leaks SDK types across its boundary.
- `transport.ts` — factory for transports. `httpTransport({ url, bearer })` returns a `StreamableHTTPClientTransport` with `Authorization: Bearer <token>` injected. `stdioTransport({ command, args, env })` returns a `StdioClientTransport` for future Docker-based adapters. Both are swappable at construction.
- `errors.ts` — `McpCallError`, `McpTransportError`. `mapMcpError(err): Error` turns transport-level errors into `RetryableError` when they are transient, otherwise returns them untouched.

The wrapper is what `JiraTaskSource` imports, not the SDK directly. Rationale: isolates SDK version upgrades to one file; lets a future `LinearTaskSource` or `ConfluenceTaskSource` use the same shape.

## The Jira adapter

Three pure files + two glue files + the adapter class.

### `options.ts` (pure)

```ts
export interface JiraTarget {
  /** Required for OAuth: the Atlassian cloudId picked at sign-in. */
  cloudId?: string;
  /** Required for API-token auth: the full base URL (e.g. "https://acme.atlassian.net"). */
  baseUrl?: string;
}

export interface JiraMcpToolCall {
  name: 'jira_search';
  arguments: {
    jql: string;
    next_page_token?: string;
    limit?: number;         // Rovo MCP's page size knob
    fields?: string[];      // request only what normalize needs
  };
}

export function buildIssuesCall(input: SourceInput, defaultJql: string, target: JiraTarget): JiraMcpToolCall;
```

Rules:
- Default JQL is "project = <configured> AND statusCategory != Done ORDER BY updated DESC" when the operator did not set one.
- `input.query` overrides the default JQL when set.
- `input.pageSize` capped at 50 (Rovo's hard limit for `jira_search`).
- `input.cursor` becomes `next_page_token`.
- `input.since` becomes a JQL fragment appended: `updated >= "{ISO}"`.
- `fields` always includes: `summary, description, status, labels, assignee, issuetype, parent, updated, created, priority, components, fixVersions`.

### `normalize.ts` (pure)

```ts
export function normalizeJiraIssue(issue: RovoJiraIssue, sourceId: SourceId, seen: Set<string>): ParsedTask;
export function extractPageInfo(payload: RovoJiraSearchResult): { nextCursor?: string; usage: SourceUsage };
```

Policy: `UpstreamKeyPolicy = { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ }`.
- Keys look like `proj-123` (slugified). Stable across title edits — a renamed issue keeps its key.
- Body: `issue.fields.description` is already markdown from Rovo (its MCP has the ADF filter on by default).
- Labels: `issue.fields.labels[]`.
- Assignees: `[issue.fields.assignee.accountId]` when set (Jira has single assignee; array for port symmetry).
- Extras: `{ issueKey, issueTypeId, issueTypeName, statusId, statusName, statusCategory, priorityName, components: string[], fixVersions: string[], parentKey?, selfUrl }`.

### `provider.ts` (the glue)

```ts
export class JiraTaskSource implements TaskSource {
  readonly id: SourceId = 'jira';
  readonly capabilities = new Set<SourceCapability>([
    'pull', 'pagination', 'incremental', 'rich_body',
    'labels', 'assignees', 'stable_upstream_key',
  ]);

  constructor(opts: {
    resolver: SourceCredentialResolver;
    projectId?: string;
    /** Injected for tests; defaults to a real McpClient. */
    mcpClient?: McpClient;
    /** Operator's default JQL; empty string means "require input.query". */
    defaultJql: string;
    retryPolicy?: RetryPolicy;
    /** Call timeout; defaults to 30s. */
    callTimeoutMs?: number;
  });

  async fetch(input: SourceInput): Promise<SourceResult> { /* ... */ }
}
```

Flow of one `fetch()`:

1. Resolve credential via the resolver. `{ kind: 'none' }` → `CredentialMissingError`, no transport opened.
2. OAuth credential expired within 60s → refresh (see `oauth.ts`) before opening transport.
3. Build the MCP client:
   - For `atlassian_oauth`: `httpTransport({ url: 'https://mcp.atlassian.com/v2/mcp', bearer: accessToken })`. Add `X-Atlassian-Cloud-Id: <cloudId>` header.
   - For `atlassian_api_token`: same URL, `bearer` is a Base64 of `email:token` with `Authorization: Basic …` — Rovo accepts both schemes.
4. Call `jira_search` with `buildIssuesCall(...)`, wrapped in `retryWithBackoff` and an `AbortSignal` with `callTimeoutMs`.
5. Map errors: MCP transport `429` / `503` / network timeouts → `RetryableError` (honour `Retry-After` when present). Anything else propagates.
6. Normalize nodes, extract page info, return `SourceResult`.
7. `redactToken` runs over any thrown error before it leaves the method. Access token, refresh token, API token — all redacted.
8. `close()` the MCP client in a `finally` block.

### `auth.ts`

```ts
export class CredentialMissingError extends Error { /* same shape as github */ }
export function redactTokens(message: string, ...tokens: Array<string | undefined>): string;
```

`redactTokens` accepts a variable number of secrets — OAuth typically has two (access + refresh).

### `oauth.ts`

OAuth 2.1 with PKCE and loopback redirect.

```ts
export interface AtlassianOAuthConfig {
  clientId: string;                 // public, shipped with Lamproom
  scopes: readonly string[];        // ['read:jira-work', 'read:jira-user', 'offline_access']
  loopbackPort?: number;            // 0 = pick a free port
  openBrowser?: (url: string) => Promise<void>;
}

export function startOAuthFlow(cfg: AtlassianOAuthConfig): Promise<{
  authUrl: string;
  state: string;
  codeVerifier: string;
  localCallback: Promise<AtlassianOAuthTokens>;  // resolves when callback fires
}>;

export function refreshIfNeeded(
  creds: Extract<SourceCredentials, { kind: 'atlassian_oauth' }>,
  clientId: string,
  now: Date,
): Promise<Extract<SourceCredentials, { kind: 'atlassian_oauth' }>>;

export function listAccessibleResources(accessToken: string): Promise<AtlassianSite[]>;
// User picks a cloudId from AtlassianSite[] in the UI.
```

The `startOAuthFlow` function is split from the HTTP route so it can be unit-tested with an injected `openBrowser` and an injected `fetch` for the callback — nothing in `oauth.ts` touches global I/O directly.

## Credentials

New `SourceCredentials` members (extending the existing union):

```ts
| { readonly kind: 'atlassian_oauth';
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresAt: string;       // ISO timestamp
    readonly cloudId: string;         // the selected Atlassian site
    readonly siteName: string;        // for UI display
  }
| { readonly kind: 'atlassian_api_token';
    readonly baseUrl: string;         // https://acme.atlassian.net
    readonly email: string;
    readonly token: string;
  }
```

`EnvFileCredentialResolver.validateEntry` learns both kinds. The `KNOWN_KINDS` set grows.

## UI integration

### `/settings/connections/tasks/jira/page.tsx`

Two tabs (shadcn `Tabs`). Top-level state: the stored credential's kind (`none | oauth | api_token`).

**Tab 1 — "Sign in with Atlassian" (OAuth)**
- When disconnected: a "Sign in with Atlassian" button that calls `GET /api/jira/auth/start`, opens the returned auth URL in a new tab, polls `GET /api/jira/auth/status` until the callback has fired and credentials are stored.
- When connected: show `siteName`, `email` of the token owner (from `/me` lookup), and a "Sign out" button.

**Tab 2 — "API token" (manual)**
- Form: Atlassian base URL, email, API token (password input). "Save."
- A "Test connection" button that calls `/api/jira/preview?limit=1`.

**Preview panel (shared below both tabs)**
- JQL textarea, pre-filled with the operator's default or the stored `defaultJql`. "Preview" button.
- Result renders as a table using the existing shadcn `Table` component: key, title, status, assignee, labels, updated.
- Errors render as a shadcn `Alert` — with `redactTokens` already applied server-side.

### API routes

```
POST   /api/jira/auth/start       → { authUrl, state }  (stores { codeVerifier, state } server-side in a short-lived memo)
GET    /api/jira/auth/callback    → exchanges code, picks cloudId if only one, stores credential, redirects back to /settings/connections/tasks/jira
GET    /api/jira/auth/status      → { connected: boolean, siteName?, email?, expiresAt? }
DELETE /api/jira/auth             → clears stored credential
POST   /api/jira/credentials      → { kind: 'atlassian_api_token', baseUrl, email, token }
GET    /api/jira/preview          → calls JiraTaskSource.fetch, returns the first page as JSON
```

The OAuth state is stored in a server-side in-memory map (Next.js module scope) with a 10-minute TTL — small, ephemeral, no DB needed.

## Trust boundary

Same discipline as GitHub, extended:

1. **OAuth `state`** must match between `/start` and `/callback`. Mismatched → 400 with a generic message, no detail about what differed.
2. **PKCE `code_verifier`** is only in server-side memory; never sent to the browser, never logged.
3. **The OAuth callback URL** only accepts loopback origins (`http://localhost:...` or `http://127.0.0.1:...`). A callback from any other origin is refused.
4. **`cloudId` is not a secret** but is authoritative — the adapter always sends the stored `cloudId` as the `X-Atlassian-Cloud-Id` header; a user cannot override it via a query parameter.
5. **Jira issue bodies are data, not instructions** — same rule as before. When a step later reads a Jira body into an agent prompt, wrap as "background."
6. **Every token is redacted** from errors via `redactTokens(message, accessToken, refreshToken, apiToken)`.

## Open questions this plan does not settle

1. **Encrypted token storage.** v1 stores OAuth refresh tokens in plaintext in `settings.json`, same as the current OpenRouter key and Slack tokens. A later plan adds OS-keychain integration (Windows Credential Manager, macOS Keychain, GNOME Keyring) as a `SourceCredentialResolver` adapter. Mentioned in `Settings And Plumbing Open Questions` #N — to be opened.
2. **Multi-site selection UI.** If the user's Atlassian login has access to multiple sites, the current plan picks the first one silently. A proper site-picker UI is a follow-up.
3. **Scope upgrade flow.** If a later Lamproom feature needs `write:jira-work`, how does the user re-authorize? Deferred.
4. **Write-back capability.** `jira_create_issue` / `jira_transition_issue` are their own plan.
5. **Fixture data source.** Pick before Task 3 of the implementation plan:
   - (a) Real Atlassian: capture 2–3 pages of real Jira issues via the claude.ai Atlassian MCP available in this session; sanitise author emails; commit as fixtures.
   - (b) Synthetic: 10 realistic hand-crafted Jira issues.
6. **Rovo pricing / rate limits.** Atlassian does not publish Rovo MCP rate limits as of November 2026. The adapter honours `Retry-After` when present and retries on 429/503; operators should watch `usage.rateLimitRemaining` (left `undefined` for now — Rovo may surface limits via a header later).

## Files this spec governs (implemented by the plan doc)

Core:
- `packages/core/src/ports/credentials.ts` (extend union)

Adapters:
- `packages/adapters/src/mcp/client.ts`
- `packages/adapters/src/mcp/transport.ts`
- `packages/adapters/src/mcp/errors.ts`
- `packages/adapters/src/ticket/jira/options.ts`
- `packages/adapters/src/ticket/jira/normalize.ts`
- `packages/adapters/src/ticket/jira/provider.ts`
- `packages/adapters/src/ticket/jira/auth.ts`
- `packages/adapters/src/ticket/jira/oauth.ts`
- `packages/adapters/src/credentials/env-file-resolver.ts` (extend)

App (Next.js):
- `app/settings/connections/tasks/jira/page.tsx`
- `app/api/jira/auth/start/route.ts`
- `app/api/jira/auth/callback/route.ts`
- `app/api/jira/auth/status/route.ts`
- `app/api/jira/auth/route.ts` (DELETE)
- `app/api/jira/credentials/route.ts` (POST)
- `app/api/jira/preview/route.ts`

Tests:
- `packages/adapters/test/mcp-client.test.ts`
- `packages/adapters/test/jira-options.test.ts`
- `packages/adapters/test/jira-normalize.test.ts`
- `packages/adapters/test/jira-provider.test.ts`
- `packages/adapters/test/jira-oauth.test.ts`
- `packages/adapters/test/jira-live.test.ts`
- `packages/adapters/test/fixtures/jira/*`

The implementation plan is `docs/superpowers/plans/2026-11-17-task-source-jira-mcp.md`.
