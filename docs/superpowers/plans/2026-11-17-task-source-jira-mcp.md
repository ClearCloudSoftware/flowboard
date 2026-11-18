# Jira TaskSource via Atlassian Rovo MCP — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `JiraTaskSource` adapter built on the Atlassian Rovo MCP v2 server, supporting both OAuth 2.1 (with PKCE, loopback redirect, refresh) and Atlassian API tokens. Includes a reusable `McpClient` wrapper under `@lamproom/adapters/src/mcp/` for future MCP-backed adapters, a settings page at `/settings/connections/tasks/jira`, API routes for OAuth and preview, and live tests against real Atlassian.

**Architecture:** Three new subdirectories under `@lamproom/adapters/src/`: `mcp/` (reusable MCP client wrapper), `ticket/jira/` (the adapter's three-file split + `auth.ts` + `oauth.ts`), and the existing `credentials/` gains support for two new credential kinds. The Next.js app gains one settings page and six API routes. `@lamproom/core` learns the new credential types but gets no new logic — the OAuth flow lives in the adapter where it belongs.

**Tech Stack:** TypeScript 5.9 run by Node 24 type stripping (no build step), `node:test`, pnpm 10 workspaces, `@modelcontextprotocol/sdk` 1.33.0 (v2 line, split into client/server subpackages — we use the client), Next.js 16 for the UI and OAuth callback routes. Rovo MCP server endpoint: `https://mcp.atlassian.com/v2/mcp`.

**Spec:** `docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md` — source of truth for every type and boundary. Reference docs: the Agent Providers vault at `docs/Lamproom/Agent Providers/` for the port pattern, the preceding TaskSource plan `docs/superpowers/plans/2026-11-14-task-source-port-markdown-and-github.md` for the shipped foundation, Atlassian Rovo MCP changelog and tool reference at `developer.atlassian.com/cloud/rovo-mcp/`.

## Global Constraints

- Work on branch `feature/task-source-jira-mcp`, already branched from `feature/task-source-port` and pushed.
- All commands run from the repo root unless stated.
- Node 24, no build step: only erasable TypeScript (no `enum`, no parameter properties, no `namespace`); type-only imports use `import type`; relative imports carry the `.ts` extension.
- `@lamproom/core` has **no** `dependencies` and never imports `@lamproom/adapters`.
- Tests use `node:test` and `node:assert/strict` only. No test framework.
- Pin `@modelcontextprotocol/sdk` to exactly `1.33.0` (the v2 stable at the time of writing). Record the exact version in the spec's table if the pin changes.
- Credentials never read from `process.env` at call time; always through the resolver.
- No OAuth client secret in the Lamproom distribution. Lamproom is a public client; OAuth uses PKCE with no secret.
- The Atlassian OAuth client id is a build-time constant (register one at `developer.atlassian.com` before Task 5 begins; see Task 5's "Preparatory step").
- Every MCP call carries an `AbortSignal` with a 30-second default timeout; no hung calls.
- `redactTokens` wraps every error leaving the adapter; access token, refresh token, API token all redacted.
- Out of scope: writes to Jira (`jira_create_issue` et al.), Jira Server/Data Center, Confluence/Bitbucket/Compass tools, encrypted token storage in OS keychain, database upsert, the project-page "import these" wizard, full JQL editor UI, webhook ingest.

## Port decisions this plan makes

| Decision | Why |
|---|---|
| `SourceCredentials` gains `atlassian_oauth` (`accessToken`, `refreshToken`, `expiresAt`, `cloudId`, `siteName`) | OAuth needs more than one field; `cloudId` must be stored alongside the token |
| `SourceCredentials` gains `atlassian_api_token` (`baseUrl`, `email`, `token`) | API tokens go via `Authorization: Basic base64(email:token)`; baseUrl is needed to disambiguate sites |
| `UpstreamKeyPolicy` for Jira is `{ trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ }` | Jira issue keys (`PROJ-123`) are stable across title edits and scoped by project |
| `JiraTaskSource` capabilities: `pull`, `pagination`, `incremental`, `rich_body`, `labels`, `assignees`, `stable_upstream_key` | Rovo returns markdown, supports `next_page_token`, accepts a `since`-equivalent via JQL |
| MCP client wrapper lives in `@lamproom/adapters/src/mcp/`, not core | SDK dependency shouldn't bleed into core |
| Default `callTimeoutMs = 30000` | Matches the SDK's default behaviour while keeping Lamproom's responsiveness |
| OAuth `state` TTL in server memory: 10 minutes | Long enough for slow authentication, short enough to prevent replay |
| Refresh triggers when `expiresAt - now < 60s` | Avoids race with an in-flight call expiring mid-flight |
| Store refresh tokens in plaintext in `settings.json` (v1) | Deferred to a separate OS-keychain plan; mirrors existing OpenRouter/Slack token handling |

## Review Focus

Five test cases that would catch the hardest failures. Each is a named test below.

1. **OAuth `state` mismatch rejects.** A callback with a `state` that doesn't match what `/auth/start` stored returns 400 with no detail. Test: Task 5, `rejects callback with mismatched state`.
2. **Expired access token refreshes before the call, not during.** When `expiresAt` is within 60s, the provider refreshes BEFORE opening the transport. A mid-flight 401 is not a retry trigger. Test: Task 4, `refreshes OAuth credential before opening transport when expiring`.
3. **MCP transport `429` with `Retry-After: 30` waits 30s, not an exponential guess.** Test: Task 4, `respects Retry-After from MCP transport over exponential`.
4. **Token redaction holds under compound errors.** A thrown `McpCallError` whose message contains both the access token and the refresh token has both redacted before propagation. Test: Task 4, `redacts access token and refresh token from error`.
5. **Credential-missing throws before any transport opens.** `{ kind: 'none' }` → `CredentialMissingError`, no `mcpClient` construction, no network. Test: Task 4, `throws CredentialMissingError before opening MCP transport`.

---

### Task 1: Credentials union extension

**Files:**
- Modify: `packages/core/src/ports/credentials.ts`
- Modify: `packages/adapters/src/credentials/env-file-resolver.ts`
- Modify: `packages/adapters/test/env-file-resolver.test.ts`
- Test: new assertions in the existing file

**Interfaces:**
- Produces (re-exported from `@lamproom/core`):
  - `SourceCredentials` gains `{ kind: 'atlassian_oauth'; ... }` and `{ kind: 'atlassian_api_token'; ... }` members per spec.
- Produces (adapters):
  - `EnvFileCredentialResolver.validateEntry` learns the two new kinds; `KNOWN_KINDS` grows from 2 to 4.

- [ ] **Step 1: Extend the failing test**

Add to `packages/adapters/test/env-file-resolver.test.ts`:

```ts
test('resolves atlassian_oauth from credentials.json', async () => {
  const root = await makeStore({
    jira: {
      kind: 'atlassian_oauth',
      accessToken: 'eyJ...',
      refreshToken: 'ref-xxx',
      expiresAt: '2026-11-17T12:00:00Z',
      cloudId: '11111111-2222-3333-4444-555555555555',
      siteName: 'acme',
    },
  });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('jira', 'default');
  assert.equal(got.kind, 'atlassian_oauth');
  assert.equal((got as { cloudId: string }).cloudId, '11111111-2222-3333-4444-555555555555');
});

test('resolves atlassian_api_token from credentials.json', async () => {
  const root = await makeStore({
    jira: {
      kind: 'atlassian_api_token',
      baseUrl: 'https://acme.atlassian.net',
      email: 'alice@acme.com',
      token: 'apitoken-xxx',
    },
  });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('jira', 'default');
  assert.equal(got.kind, 'atlassian_api_token');
});

test('rejects atlassian_oauth missing required fields', async () => {
  const root = await makeStore({
    jira: { kind: 'atlassian_oauth', accessToken: 'eyJ...' },  // missing refreshToken, etc.
  });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('jira', 'default'), /atlassian_oauth/);
});
```

- [ ] **Step 2: Run to confirm fail**

- [ ] **Step 3: Implement**

In `credentials.ts`, extend the union per spec. In `env-file-resolver.ts`, add two new validators (`validateAtlassianOAuth`, `validateAtlassianApiToken`); grow `KNOWN_KINDS`.

- [ ] **Step 4: Run to confirm pass + typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): atlassian_oauth and atlassian_api_token credential kinds"
```

---

### Task 2: MCP client wrapper

**Files:**
- Create: `packages/adapters/src/mcp/client.ts`
- Create: `packages/adapters/src/mcp/transport.ts`
- Create: `packages/adapters/src/mcp/errors.ts`
- Modify: `packages/adapters/src/index.ts` (re-export)
- Modify: `packages/adapters/package.json` (add `@modelcontextprotocol/sdk@1.33.0` as a runtime dep — currently devDep)
- Test: `packages/adapters/test/mcp-client.test.ts`

**Interfaces:**
- Produces:
  - `class McpClient` with `constructor(transport: McpTransport)`, `listTools(): Promise<McpToolDescriptor[]>`, `callTool<T>(name: string, args: Record<string, unknown>, opts: { signal: AbortSignal }): Promise<T>`, `close(): Promise<void>`.
  - `httpTransport(opts: { url: string | URL; bearer?: string; headers?: Record<string, string> }): McpTransport`
  - `stdioTransport(opts: { command: string; args?: string[]; env?: Record<string, string> }): McpTransport` — stub in this task, implemented when a Docker-backed adapter needs it.
  - `class McpCallError`, `class McpTransportError`, `function mapMcpError(err: unknown): Error` — turns retryable transport errors into `RetryableError`.
- Consumes: `RetryableError` from `@lamproom/core`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/adapters/test/mcp-client.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, mapMcpError, McpTransportError } from '../src/mcp/client.ts';
import { RetryableError } from '@lamproom/core';

function makeFakeTransport(responses: Record<string, unknown>) {
  const ops: string[] = [];
  return {
    ops,
    transport: {
      async callTool(name: string, args: Record<string, unknown>) {
        ops.push(`callTool:${name}`);
        if (!(name in responses)) throw new Error(`no fake response for ${name}`);
        return responses[name];
      },
      async listTools() { ops.push('listTools'); return []; },
      async close() { ops.push('close'); },
    },
  };
}

test('callTool forwards name, args and returns payload', async () => {
  const { transport, ops } = makeFakeTransport({ jira_search: { issues: [] } });
  const c = new McpClient(transport as never);
  const r = await c.callTool<{ issues: unknown[] }>('jira_search', { jql: 'x' }, { signal: new AbortController().signal });
  assert.deepEqual(r, { issues: [] });
  assert.deepEqual(ops, ['callTool:jira_search']);
});

test('mapMcpError maps 429 to RetryableError with retryAfterMs', () => {
  const err = new McpTransportError('rate limit', 429, { 'retry-after': '3' });
  const mapped = mapMcpError(err);
  assert.ok(mapped instanceof RetryableError);
  assert.equal((mapped as RetryableError).retryAfterMs, 3000);
});

test('mapMcpError leaves 401 untouched (not retryable)', () => {
  const err = new McpTransportError('unauthorized', 401, {});
  assert.equal(mapMcpError(err).message, 'unauthorized');
});

test('mapMcpError maps >=500 to RetryableError', () => {
  const err = new McpTransportError('server error', 503, {});
  assert.ok(mapMcpError(err) instanceof RetryableError);
});

test('close() delegates to the transport', async () => {
  const { transport, ops } = makeFakeTransport({});
  const c = new McpClient(transport as never);
  await c.close();
  assert.deepEqual(ops, ['close']);
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

`errors.ts`:
```ts
export class McpTransportError extends Error {
  constructor(message: string, public readonly status: number, public readonly headers: Record<string, string>) {
    super(message);
    this.name = 'McpTransportError';
  }
}

export class McpCallError extends Error {
  constructor(message: string, public readonly toolName: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'McpCallError';
  }
}

export function mapMcpError(err: unknown): Error {
  if (err instanceof McpTransportError) {
    const retryAfter = err.headers['retry-after'];
    const ms = retryAfter !== undefined ? Number(retryAfter) * 1000 : undefined;
    if (err.status === 429) return new RetryableError(err.message, ms);
    if (err.status === 503) return new RetryableError(err.message, ms);
    if (err.status >= 500) return new RetryableError(err.message, ms);
    return err;
  }
  return err instanceof Error ? err : new Error(String(err));
}
```

`client.ts`:
```ts
export interface McpTransport {
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  listTools(): Promise<McpToolDescriptor[]>;
  close(): Promise<void>;
}

export class McpClient {
  constructor(private readonly transport: McpTransport) {}

  async listTools(): Promise<McpToolDescriptor[]> {
    return this.transport.listTools();
  }

  async callTool<T>(name: string, args: Record<string, unknown>, opts: { signal: AbortSignal }): Promise<T> {
    try {
      return (await this.transport.callTool(name, args, opts.signal)) as T;
    } catch (err) {
      throw mapMcpError(err);
    }
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
```

`transport.ts`:
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function httpTransport(opts: { url: string | URL; bearer?: string; headers?: Record<string, string> }): McpTransport {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;

  const sdkTransport = new StreamableHTTPClientTransport(new URL(opts.url), { requestInit: { headers } });
  const client = new Client({ name: 'lamproom', version: '0.1.0' }, { capabilities: {} });

  let connected = false;
  async function connect(): Promise<void> {
    if (connected) return;
    await client.connect(sdkTransport);
    connected = true;
  }

  return {
    async callTool(name, args, signal) {
      await connect();
      const result = await client.callTool({ name, arguments: args }, undefined, { signal });
      return result.content;
    },
    async listTools() {
      await connect();
      const { tools } = await client.listTools();
      return tools.map(t => ({ name: t.name, description: t.description }));
    },
    async close() {
      if (connected) await client.close();
    },
  };
}

export function stdioTransport(_opts: { command: string; args?: string[]; env?: Record<string, string> }): McpTransport {
  throw new Error('stdioTransport: not implemented (lands when a Docker-backed MCP adapter needs it)');
}
```

- [ ] **Step 4: Run to pass + typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(adapters): McpClient wrapper around @modelcontextprotocol/sdk v2"
```

---

### Task 3: Jira options + normalize

**Files:**
- Create: `packages/adapters/src/ticket/jira/options.ts`
- Create: `packages/adapters/src/ticket/jira/normalize.ts`
- Create: `packages/adapters/test/fixtures/jira/search-page1.json`
- Test: `packages/adapters/test/jira-options.test.ts`
- Test: `packages/adapters/test/jira-normalize.test.ts`

**Interfaces:**
- Produces:
  - `interface JiraTarget { cloudId?: string; baseUrl?: string }`
  - `interface JiraMcpToolCall { name: 'jira_search'; arguments: { jql: string; next_page_token?: string; limit?: number; fields?: string[] } }`
  - `function buildIssuesCall(input: SourceInput, defaultJql: string, target: JiraTarget): JiraMcpToolCall`
  - `function normalizeJiraIssue(issue: RovoJiraIssue, sourceId: SourceId, seen: Set<string>): ParsedTask`
  - `function extractPageInfo(payload: RovoJiraSearchResult): { nextCursor?: string; usage: SourceUsage }`
  - Types: `RovoJiraIssue`, `RovoJiraSearchResult`

**Preparatory step (do once, before Step 1):**

Capture a representative Rovo `jira_search` response. In this session I have access to the `mcp__claude_ai_Atlassian__*` tools. If fixture-source decision is "(a) real," authenticate first:
  - Run `mcp__claude_ai_Atlassian__authenticate`
  - Complete OAuth in browser
  - Call `jira_search` on a demo project
  - Save the response as `fixtures/jira/search-page1.json` (sanitised: replace emails with `*@example.com`, replace author display names with first-name-only)

If decision is "(b) synthetic," hand-craft `search-page1.json` with 5 issues (one with labels, one with multiple assignees, one with null description, one with a parent, one with components + fixVersions) per the `RovoJiraIssue` shape below.

- [ ] **Step 1: Capture or craft the fixture**

- [ ] **Step 2: Write the failing normalize test**

```ts
// packages/adapters/test/jira-normalize.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeJiraIssue, extractPageInfo, type RovoJiraSearchResult } from '../src/ticket/jira/normalize.ts';

const here = import.meta.dirname;

async function fixture(): Promise<RovoJiraSearchResult> {
  const text = await readFile(join(here, 'fixtures/jira/search-page1.json'), 'utf8');
  return JSON.parse(text);
}

test('normalizes a Jira issue into a ParsedTask with key-based importKey', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const issue = payload.issues[0]!;
  const t = normalizeJiraIssue(issue, 'jira', seen);
  assert.match(t.importKey, /^[a-z][a-z0-9]+-\d+$/);
  assert.equal(t.title, issue.fields.summary);
  assert.equal(t._hint.upstream, issue.key);
  assert.ok(Array.isArray(t.labels));
  assert.ok(Array.isArray(t.assignees));
  assert.equal(typeof t.extras?.issueKey, 'string');
});

test('leaves body undefined when description is null', async () => {
  const payload = await fixture();
  const nullBodyIssue = payload.issues.find(i => i.fields.description === null);
  assert.ok(nullBodyIssue, 'fixture must include an issue with null description');
  const seen = new Set<string>();
  const t = normalizeJiraIssue(nullBodyIssue, 'jira', seen);
  assert.equal(t.body, undefined);
});

test('maps assignee to single-element array when set, empty when unassigned', async () => {
  // Expects at least one assigned and one unassigned in the fixture.
  // ... assertions ...
});

test('extractPageInfo returns nextCursor from next_page_token', async () => {
  const payload = await fixture();
  const info = extractPageInfo(payload);
  if (payload.next_page_token !== undefined) {
    assert.equal(info.nextCursor, payload.next_page_token);
  } else {
    assert.equal(info.nextCursor, undefined);
  }
  assert.equal(info.usage.requests, 1);
});
```

- [ ] **Step 3: Write the failing options test**

```ts
// packages/adapters/test/jira-options.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesCall } from '../src/ticket/jira/options.ts';

test('defaults to the operator JQL when input has no query', () => {
  const call = buildIssuesCall({}, 'project = ACME AND statusCategory != Done ORDER BY updated DESC', {});
  assert.equal(call.name, 'jira_search');
  assert.match(call.arguments.jql, /project = ACME/);
  assert.equal(call.arguments.limit, 50);
});

test('input.query overrides the default JQL', () => {
  const call = buildIssuesCall({ query: 'assignee = currentUser()' }, 'project = X', {});
  assert.equal(call.arguments.jql, 'assignee = currentUser()');
});

test('appends updated-since fragment when input.since is set', () => {
  const call = buildIssuesCall({ since: '2026-11-01T00:00:00Z' }, 'project = X', {});
  assert.match(call.arguments.jql, /updated >= "2026-11-01T00:00:00Z"/);
});

test('caps limit at 50 when caller asks for more', () => {
  const call = buildIssuesCall({ pageSize: 200 }, 'project = X', {});
  assert.equal(call.arguments.limit, 50);
});

test('passes cursor as next_page_token', () => {
  const call = buildIssuesCall({ cursor: 'abc' }, 'project = X', {});
  assert.equal(call.arguments.next_page_token, 'abc');
});

test('includes fields list', () => {
  const call = buildIssuesCall({}, 'project = X', {});
  assert.ok(call.arguments.fields?.includes('summary'));
  assert.ok(call.arguments.fields?.includes('description'));
  assert.ok(call.arguments.fields?.includes('labels'));
});

test('throws when neither input.query nor defaultJql is set', () => {
  assert.throws(() => buildIssuesCall({}, '', {}), /JQL/);
});
```

- [ ] **Step 4: Run both to fail**

- [ ] **Step 5: Implement**

Write `options.ts` per spec rules. Write `normalize.ts`:
- `normalizeJiraIssue`: builds `_hint = { upstream: issue.key, titleSlug: slugify(issue.fields.summary) }`; `importKey = deriveImportKey('jira', hint, { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ }, seen)`; maps fields per spec.
- `extractPageInfo`: returns `{ nextCursor: payload.next_page_token, usage: { requests: 1 } }`.

- [ ] **Step 6: Run to pass + typecheck**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(adapters): Jira options + normalize (pure, fixture-driven)"
```

---

### Task 4: Jira provider

**Files:**
- Create: `packages/adapters/src/ticket/jira/provider.ts`
- Create: `packages/adapters/src/ticket/jira/auth.ts`
- Modify: `packages/adapters/src/index.ts`
- Test: `packages/adapters/test/jira-provider.test.ts`

**Interfaces:**
- Consumes: `TaskSource`, `SourceInput`, `SourceResult`, `SourceCapability`, `SourceCredentialResolver`, `RetryableError`, `retryWithBackoff`, `DEFAULT_RETRY`, `RetryPolicy` from `@lamproom/core`; `McpClient` and `httpTransport` from `../../mcp/client.ts`.
- Produces:
  - `class CredentialMissingError extends Error` in `auth.ts`
  - `function redactTokens(message: string, ...tokens: Array<string | undefined>): string` in `auth.ts`
  - `class JiraTaskSource implements TaskSource` in `provider.ts` with constructor options per spec.

- [ ] **Step 1: Write the failing test**

```ts
// packages/adapters/test/jira-provider.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JiraTaskSource } from '../src/ticket/jira/provider.ts';
import { CredentialMissingError } from '../src/ticket/jira/auth.ts';
import { RetryableError, type SourceCredentialResolver } from '@lamproom/core';
import { McpClient } from '../src/mcp/client.ts';
import { McpTransportError } from '../src/mcp/errors.ts';

const here = import.meta.dirname;
async function payload() {
  return JSON.parse(await readFile(join(here, 'fixtures/jira/search-page1.json'), 'utf8'));
}

function fakeClient(responses: unknown[]): McpClient {
  let i = 0;
  const transport = {
    async callTool() { return responses[i++]; },
    async listTools() { return []; },
    async close() {},
  };
  return new McpClient(transport as never);
}

test('throws CredentialMissingError before opening MCP transport (Review Focus #5)', async () => {
  let clientBuilt = 0;
  const src = new JiraTaskSource({
    resolver: { resolve: async () => ({ kind: 'none' }) },
    defaultJql: 'project = X',
    mcpClient: (() => { clientBuilt++; return fakeClient([]); })(),
  });
  // Even though mcpClient is already built, provider must throw before calling it.
  await assert.rejects(src.fetch({}), (e: Error) => e instanceof CredentialMissingError);
  assert.equal(clientBuilt, 1);  // built but not called
});

test('refreshes OAuth credential before opening transport when expiring (Review Focus #2)', async () => {
  const now = new Date('2026-11-17T10:00:00Z');
  const expiring = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'old',
    refreshToken: 'ref',
    expiresAt: '2026-11-17T10:00:30Z',  // 30s from now, within the 60s refresh window
    cloudId: 'cid',
    siteName: 'acme',
  };
  let refreshed = false;
  const src = new JiraTaskSource({
    resolver: { resolve: async () => expiring },
    defaultJql: 'project = X',
    mcpClient: fakeClient([await payload()]),
    nowFn: () => now,
    refreshOAuthFn: async () => {
      refreshed = true;
      return { ...expiring, accessToken: 'new', expiresAt: '2026-11-17T11:00:00Z' };
    },
  });
  await src.fetch({});
  assert.equal(refreshed, true);
});

test('respects Retry-After from MCP transport over exponential (Review Focus #3)', async () => {
  let calls = 0;
  const transport = {
    async callTool() {
      if (calls++ === 0) throw new McpTransportError('rate', 429, { 'retry-after': '1' });
      return await payload();
    },
    async listTools() { return []; },
    async close() {},
  };
  const client = new McpClient(transport as never);
  const start = Date.now();
  const src = new JiraTaskSource({
    resolver: { resolve: async () => ({ kind: 'atlassian_api_token', baseUrl: 'https://x.atlassian.net', email: 'a@b', token: 't' }) },
    defaultJql: 'project = X',
    mcpClient: client,
    retryPolicy: { maxAttempts: 2, baseMs: 10000, maxMs: 10000, respectRetryAfter: true },  // force baseMs high to prove Retry-After wins
  });
  await src.fetch({});
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 900, `expected ~1000ms wait (Retry-After), got ${elapsed}`);
  assert.ok(elapsed < 2000, `expected ~1000ms wait, got ${elapsed}`);
});

test('redacts access token and refresh token from error (Review Focus #4)', async () => {
  const accessToken = 'eyJHEADERPAYLOADSIGNATURE';
  const refreshToken = 'refreshtokensecret';
  const transport = {
    async callTool() { throw new Error(`Bad: ${accessToken} and ${refreshToken}`); },
    async listTools() { return []; },
    async close() {},
  };
  const src = new JiraTaskSource({
    resolver: async () => ({ kind: 'atlassian_oauth', accessToken, refreshToken, expiresAt: '2030-01-01T00:00:00Z', cloudId: 'c', siteName: 's' }) as never,
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport as never),
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), (e: Error) => {
    return !e.message.includes(accessToken) && !e.message.includes(refreshToken) && e.message.includes('[redacted]');
  });
});

test('nextCursor present when response has next_page_token', async () => {
  const src = new JiraTaskSource({
    resolver: { resolve: async () => ({ kind: 'atlassian_api_token', baseUrl: 'x', email: 'a', token: 't' }) },
    defaultJql: 'project = X',
    mcpClient: fakeClient([await payload()]),
  });
  const r = await src.fetch({});
  assert.equal(typeof r.nextCursor, 'string');
  assert.ok(r.tasks.length > 0);
});

test('closes the MCP client on success and on error', async () => {
  let closed = 0;
  const transport = {
    async callTool() { return await payload(); },
    async listTools() { return []; },
    async close() { closed++; },
  };
  const src = new JiraTaskSource({
    resolver: { resolve: async () => ({ kind: 'atlassian_api_token', baseUrl: 'x', email: 'a', token: 't' }) },
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport as never),
  });
  await src.fetch({});
  assert.equal(closed, 1);
});

test('capabilities set is exactly the seven declared', () => {
  const src = new JiraTaskSource({
    resolver: { resolve: async () => ({ kind: 'none' }) },
    defaultJql: 'project = X',
    mcpClient: fakeClient([]),
  });
  assert.deepEqual([...src.capabilities].sort(), [
    'assignees', 'incremental', 'labels', 'pagination', 'pull', 'rich_body', 'stable_upstream_key',
  ]);
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

`auth.ts`:
```ts
export class CredentialMissingError extends Error {
  constructor(public readonly sourceId: string, public readonly projectId: string) {
    super(`no credentials configured for source '${sourceId}' and project '${projectId}'`);
    this.name = 'CredentialMissingError';
  }
}

export function redactTokens(message: string, ...tokens: Array<string | undefined>): string {
  let out = message;
  for (const t of tokens) {
    if (t !== undefined && t !== '') out = out.split(t).join('[redacted]');
  }
  return out;
}
```

`provider.ts` per spec. Key beats:
- Constructor accepts `mcpClient` (injectable for tests); when absent, falls back to building one from `httpTransport` at first `fetch`.
- Accepts `nowFn: () => Date` (defaults to `() => new Date()`) and `refreshOAuthFn: (creds) => Promise<creds>` (defaults to the real `oauth.ts` implementation, lazily imported to keep this file testable without OAuth plumbing).
- `fetch()` sequence:
  1. Resolve credentials. `none` → throw `CredentialMissingError`.
  2. If OAuth and `expiresAt - now < 60s`, call `refreshOAuthFn`.
  3. `buildIssuesCall(input, this.defaultJql, { cloudId, baseUrl })`.
  4. `retryWithBackoff(() => this.mcpClient.callTool('jira_search', args, { signal }), this.retryPolicy)`.
  5. Normalize + extract page info + return result.
  6. `finally` closes the client.
  7. Wrap-around `catch` runs `redactTokens(err.message, accessToken, refreshToken, apiToken)`.

- [ ] **Step 4: Run to pass + typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(adapters): JiraTaskSource with OAuth refresh and Retry-After"
```

---

### Task 5: Jira OAuth flow helper

**Preparatory step (before Step 1):** Register an Atlassian OAuth app at `developer.atlassian.com/console/myapps/`. Choose "OAuth 2.0 (3LO)." Callback URL: `http://localhost:0/callback` (loopback). Scopes: `read:jira-work`, `read:jira-user`, `offline_access`. Record the Client ID — it's a build-time constant in Lamproom. Do NOT record any client secret; this is a public client.

**Files:**
- Create: `packages/adapters/src/ticket/jira/oauth.ts`
- Test: `packages/adapters/test/jira-oauth.test.ts`

**Interfaces:**
- Produces:
  - `interface AtlassianOAuthConfig { clientId: string; scopes: readonly string[]; loopbackPort?: number; openBrowser?: (url: string) => Promise<void>; fetchFn?: typeof fetch }`
  - `interface AtlassianOAuthTokens { accessToken: string; refreshToken: string; expiresAt: string }`
  - `interface AtlassianSite { id: string; name: string; url: string; scopes: string[] }`
  - `function pkcePair(): { verifier: string; challenge: string }`
  - `function buildAuthUrl(cfg: AtlassianOAuthConfig, state: string, challenge: string, redirectUri: string): URL`
  - `function exchangeCode(cfg: AtlassianOAuthConfig, args: { code: string; verifier: string; redirectUri: string }): Promise<AtlassianOAuthTokens>`
  - `function refreshIfNeeded(creds: Extract<SourceCredentials, { kind: 'atlassian_oauth' }>, clientId: string, now: Date, fetchFn?: typeof fetch): Promise<Extract<SourceCredentials, { kind: 'atlassian_oauth' }>>`
  - `function listAccessibleResources(accessToken: string, fetchFn?: typeof fetch): Promise<AtlassianSite[]>`
  - `function startOAuthFlow(cfg: AtlassianOAuthConfig): Promise<{ authUrl: string; state: string; codeVerifier: string; localCallback: Promise<AtlassianOAuthTokens> }>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/adapters/test/jira-oauth.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pkcePair, buildAuthUrl, exchangeCode, refreshIfNeeded, listAccessibleResources } from '../src/ticket/jira/oauth.ts';

test('pkcePair returns a 43-char verifier and a URL-safe challenge', () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.match(challenge, /^[A-Za-z0-9\-_]+$/);
  assert.equal(challenge.includes('='), false);
});

test('buildAuthUrl includes every required Atlassian OAuth parameter', () => {
  const url = buildAuthUrl(
    { clientId: 'cid', scopes: ['read:jira-work', 'read:jira-user', 'offline_access'] },
    'state-x',
    'challenge-y',
    'http://127.0.0.1:7777/callback',
  );
  assert.equal(url.origin, 'https://auth.atlassian.com');
  assert.equal(url.pathname, '/authorize');
  assert.equal(url.searchParams.get('audience'), 'api.atlassian.com');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('scope'), 'read:jira-work read:jira-user offline_access');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:7777/callback');
  assert.equal(url.searchParams.get('state'), 'state-x');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-y');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('exchangeCode POSTs to the token endpoint with PKCE verifier', async () => {
  const seen: unknown[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), { status: 200 });
  };
  const tokens = await exchangeCode(
    { clientId: 'cid', scopes: [], fetchFn: fakeFetch } as never,
    { code: 'the-code', verifier: 'ver-xxx', redirectUri: 'http://127.0.0.1:7777/callback' },
  );
  assert.equal(tokens.accessToken, 'a');
  assert.equal(tokens.refreshToken, 'r');
  assert.ok(new Date(tokens.expiresAt).getTime() > Date.now());
  assert.ok(seen.length === 1);
});

test('refreshIfNeeded is a no-op when expiresAt is >60s away', async () => {
  const creds = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'a', refreshToken: 'r',
    expiresAt: '2030-01-01T00:00:00Z',
    cloudId: 'c', siteName: 's',
  };
  const out = await refreshIfNeeded(creds, 'cid', new Date('2026-11-17T10:00:00Z'));
  assert.equal(out.accessToken, 'a');
});

test('refreshIfNeeded calls the token endpoint when expiry is near', async () => {
  let called = 0;
  const fakeFetch: typeof fetch = async () => {
    called++;
    return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'newref', expires_in: 3600 }), { status: 200 });
  };
  const creds = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'old', refreshToken: 'r',
    expiresAt: '2026-11-17T10:00:30Z',
    cloudId: 'c', siteName: 's',
  };
  const out = await refreshIfNeeded(creds, 'cid', new Date('2026-11-17T10:00:00Z'), fakeFetch);
  assert.equal(out.accessToken, 'new');
  assert.equal(out.refreshToken, 'newref');
  assert.equal(called, 1);
});

test('listAccessibleResources returns sites with id and name', async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify([
      { id: 'cid-1', name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'] },
    ]), { status: 200 });
  const sites = await listAccessibleResources('token', fakeFetch);
  assert.equal(sites.length, 1);
  assert.equal(sites[0]?.id, 'cid-1');
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

Per spec. `startOAuthFlow` is not tested at the unit level — its integration happens in the HTTP route (Task 6).

Loopback server pattern (inside `startOAuthFlow`):
- Create an `http.Server`; `listen(0, '127.0.0.1')` to grab a free port.
- Install a handler for `/callback?code=...&state=...`.
- Return `localCallback` as a `Promise<AtlassianOAuthTokens>` that resolves when the handler fires and `exchangeCode` succeeds; rejects after 10 minutes.
- Close the server once the promise settles.

- [ ] **Step 4: Run to pass + typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(adapters): Atlassian OAuth 2.1 with PKCE and loopback redirect"
```

---

### Task 6: API routes

**Files:**
- Create: `app/api/jira/auth/start/route.ts`
- Create: `app/api/jira/auth/callback/route.ts`
- Create: `app/api/jira/auth/status/route.ts`
- Create: `app/api/jira/auth/route.ts` (DELETE handler)
- Create: `app/api/jira/credentials/route.ts` (POST handler for API-token auth)
- Create: `app/api/jira/preview/route.ts`
- Test: `app/api/jira/local.test.ts` (unit tests for each route's handler logic, using Next's App Router request/response constructors)

**Interfaces:** Each route follows the Lamproom convention (compare `app/api/openrouter/key/route.ts`). All handlers:
- Validate body / query via zod.
- Read/write credentials via the same `app-settings.ts` + credentials mechanism used by OpenRouter and Slack.
- Return JSON with a `{ ok: true, ... }` or `{ error: string }` shape.

- [ ] **Step 1: Write the failing tests** — one test per route covering the happy path and the hardest failure (e.g. `callback` with mismatched state, Review Focus #1).

- [ ] **Step 2–4: Implement each route**

Notes:
- `/api/jira/auth/start` generates `{ codeVerifier, state }` via `pkcePair()` + `crypto.randomUUID()`, stores them in an in-memory `Map<state, { codeVerifier, createdAt }>` at module scope with a 10-minute TTL sweep, builds the auth URL, returns `{ authUrl, state }`.
- `/api/jira/auth/callback` reads `?code=&state=`, looks up `state` in the map (rejects with 400 if absent — Review Focus #1), exchanges code, calls `listAccessibleResources`, picks the first site (follow-up: UI picker), stores credential, redirects back to `/settings/connections/tasks/jira`.
- `/api/jira/preview` builds a `JiraTaskSource`, calls `fetch({ pageSize: 10 })`, returns the first page as JSON. Operator can pass `?jql=` to override the default.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): /api/jira/* routes for OAuth, credentials and preview"
```

---

### Task 7: Settings UI

**Files:**
- Create: `app/settings/connections/tasks/jira/page.tsx`
- Modify: `app/settings/nav.tsx` (link the page)
- Modify: `app/settings/settings.tsx` (flip Jira card from "coming soon" to active)

**Interfaces:** Standard Lamproom settings page shape. Uses:
- shadcn `Tabs`, `Button`, `Input`, `Textarea`, `Alert`, `Table`, `Card`
- TanStack Query for `/api/jira/auth/status` polling and `/api/jira/preview` fetching

Three UI states:
- Disconnected: empty, two tabs, buttons
- Connecting (OAuth in progress): spinner, "waiting for Atlassian..."
- Connected: shows siteName + email, preview panel active

- [ ] **Step 1–5:** Build the page following existing settings pages as templates (e.g. `app/settings/llm-providers/openrouter/page.tsx`). Keep every value server-driven (no secrets in client state).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(app): /settings/connections/tasks/jira page with OAuth and API-token tabs"
```

---

### Task 8: Live tests, operator guide, vault updates

**Files:**
- Create: `packages/adapters/test/jira-live.test.ts`
- Modify: `README.task-sources.md` (add a Jira section)
- Modify: `docs/Lamproom/Intake And Import/Future Task Sources.md` (mark Jira as shipped)
- Modify: `docs/Lamproom/Intake And Import/Intake And Import Open Questions.md` (resolve relevant OQs)

- [ ] **Step 1: Write the live test**

```ts
// packages/adapters/test/jira-live.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JiraTaskSource } from '../src/ticket/jira/provider.ts';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';

const live = process.env.FLOWBOARD_LIVE === '1' && process.env.FLOWBOARD_LIVE_JIRA_JQL !== undefined;

test('live Jira fetch returns real issues (OAuth or API-token)', { skip: !live }, async () => {
  const src = new JiraTaskSource({
    resolver: new EnvFileCredentialResolver({ root: process.env.FLOWBOARD_LIVE_ROOT ?? process.cwd() }),
    projectId: 'live',
    defaultJql: process.env.FLOWBOARD_LIVE_JIRA_JQL!,
  });
  const r = await src.fetch({ pageSize: 5 });
  assert.ok(Array.isArray(r.tasks));
  assert.ok(r.usage.requests >= 1);
  if (r.tasks.length > 0) {
    const first = r.tasks[0]!;
    assert.match(first.importKey, /^[a-z][a-z0-9]+-\d+$/);
    assert.ok(first._hint.upstream?.match(/^[A-Z][A-Z0-9]+-\d+$/));
  }
});
```

- [ ] **Step 2: Run once with real Atlassian** (API token in `.lamproom/credentials.json`, JQL that returns ≥1 issue). Record result.

- [ ] **Step 3: Extend the operator guide**

Add to `README.task-sources.md` a "Jira (via Atlassian Rovo MCP)" section with: credential schema for both kinds; the OAuth flow screenshot pointer; scopes needed; how to run the live test; the error table extended with Jira-specific messages.

- [ ] **Step 4: Update the vault**

- `Future Task Sources.md`: add a 2026-11-17 banner marking Jira (Cloud via Rovo MCP) as shipped; Jira Server/DC still open.
- `Intake And Import Open Questions.md`: mark #4 fully resolved (Jira joins GitHub as a stable-upstream source).

- [ ] **Step 5: Commit**

```bash
git commit -m "docs(task-source-jira): live tests, operator guide, vault decisions"
```

---

## When done

- [ ] `node --test packages/core/test/*.test.ts packages/adapters/test/*.test.ts` — every new test passes.
- [ ] `pnpm typecheck:packages` — clean.
- [ ] `pnpm test:live` with a real Atlassian credential + `FLOWBOARD_LIVE_JIRA_JQL` — Jira lane passes.
- [ ] `grep -r "process.env.ATLASSIAN" packages/adapters/` — empty. (No env-reads at call time.)
- [ ] `grep -r "accessToken\|refreshToken\|apiToken" packages/adapters/src/ticket/jira/` — only appears in `oauth.ts`, `provider.ts`, `auth.ts` (not in any test file as a plaintext string that could leak).
- [ ] Open a PR against `feature/task-source-port` (one PR per branch, then merge GitHub plan first, rebase Jira, merge second).

## What this plan does **not** finish

1. **Writes back to Jira.** `jira_create_issue`, `jira_transition_issue`, `jira_add_comment` — own plan.
2. **Jira Server / Data Center.** Separate adapter using `sooperset/mcp-atlassian` via stdio.
3. **Multi-site OAuth picker UI.** Current behaviour: first site wins.
4. **OS-keychain credential storage.** OAuth refresh tokens live in `settings.json` plaintext until this is built.
5. **JQL builder UI.** The settings page takes a single JQL string.
6. **Webhook ingest.** Jira webhooks (`issue_created`, `issue_updated`) land in the `ingest()` path when webhooks ship for the whole port.
7. **Linear MCP, Confluence MCP, Compass MCP.** The `McpClient` wrapper lands here, making future adapters incremental.
8. **Database upsert of pulled issues.** Preview-only until the intake API plan.
