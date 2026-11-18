# Task Sources — operator guide

Lamproom's `TaskSource` port pulls work items (issues, tickets, markdown
backlog entries) into the board. Each source is an adapter under
`@lamproom/adapters/src/ticket/<id>/` that implements the port.

This guide covers three adapters: the markdown adapter, the GitHub Issues
adapter, and the Jira adapter (via Atlassian's Rovo MCP server). Linear,
webhooks and the sandboxed backlog-importer agent ship in follow-up plans.

## Credentials

Credentials live in `.lamproom/credentials.json` under the Lamproom
installation root. One file per installation (project-scoped credentials
are a follow-up). Shape:

```json
{
  "github": { "kind": "github_pat", "token": "ghp_YourPersonalAccessToken" }
}
```

On POSIX, Lamproom **refuses to read the file** unless it has mode `0600`.
Any broader permissions cause the resolver to throw with an error naming
"mode". This catches the common editor-strips-permissions mistake. On
Windows the mode check is skipped — NTFS perms don't map cleanly; protect
the file via the file system's ACLs instead.

```bash
# POSIX
install -m 0600 /dev/null .lamproom/credentials.json
$EDITOR .lamproom/credentials.json
chmod 0600 .lamproom/credentials.json  # if your editor rewrote it
```

**The GitHub token's scopes** — a classic PAT needs `public_repo` for
public repos, `repo` for private repos. A fine-grained token needs
`Issues: Read-only` on the target repos. No other scope is required by this
adapter.

**Credentials are never read from `process.env` at call time.** The worker's
own `GITHUB_TOKEN` or `GH_TOKEN` is ignored. If you want an environment-
backed resolver, write a different `SourceCredentialResolver` adapter and
pass it to the source — don't rely on env variable fallback.

## The markdown adapter

Reads a backlog file. No credentials, no network. Good for seeding a project
or importing work from a design doc.

```ts
import { MarkdownTaskSource } from '@lamproom/adapters';

const src = new MarkdownTaskSource();
const result = await src.fetch({ path: './backlog.md' });
// result.tasks: ParsedTask[]
// result.usage: { requests: 0, bytesRead: <file size> }
```

Supported file shape (from `docs/Lamproom/Intake And Import/Backlog File
Shapes.md`):

* `##` headings open a task. `#` and `####+` do not.
* Prose before the first `##` is dropped.
* Within a task: a `### Acceptance criteria` or `### Non-goals` subheading
  routes the following bulleted list into first-class fields. Prose before
  the first special subheading is the body; content after is dropped.
* A trailing `{#slug}` on a heading becomes the task's stable `importKey` —
  the one you set once, then keep forever even if the title changes.

Example:

```markdown
## Rotate refresh tokens on every use

Short description.

### Acceptance criteria

- Users keep their session across the rotation.
- No window where both tokens are valid.

### Non-goals

- Revoking old tokens from other devices.

## Backfill the audit log {#backfill}

Historical rows need the new columns.
```

Two files with the same `{#slug}` throws — this is intentional. Rename one
before the import can land.

## The GitHub Issues adapter

Pulls open issues from one GitHub repository as `ParsedTask[]`. Paginates.
Respects rate limits. Retries on transient errors.

```ts
import { EnvFileCredentialResolver, GithubTaskSource } from '@lamproom/adapters';

const src = new GithubTaskSource({
  target: { owner: 'octokit', repo: 'octokit.js' },
  resolver: new EnvFileCredentialResolver({ root: '/path/to/lamproom-root' }),
  projectId: 'default',
});

let cursor: string | undefined;
do {
  const page = await src.fetch({ cursor, pageSize: 50 });
  // ... upsert page.tasks ...
  cursor = page.nextCursor;

  if ((page.usage.rateLimitRemaining ?? Infinity) < 100) {
    // Back off for a bit; the resetAt is in page.usage.rateLimitResetAt.
    break;
  }
} while (cursor !== undefined);
```

Key points:

* **Pagination is the caller's loop.** The provider never pages internally
  — otherwise quotas become opaque and progress reports become impossible.
* **`usage.rateLimitRemaining`** tells you how much headroom you have on
  the authenticated user's GitHub quota (5000 requests/hour for a classic
  PAT). Watch this and back off when it's low.
* **`importKey`** uses the numeric-upstream pattern: `github-42`,
  `github-137`. It stays stable across title edits, so re-importing after
  a rename does not duplicate the task.
* **Secondary rate limits** (`403` + a `Retry-After` header) are honoured:
  the adapter waits the header value and retries up to `maxAttempts`. The
  default retry policy is `{ maxAttempts: 3, baseMs: 500, maxMs: 10_000,
  respectRetryAfter: true }`; override via the `retryPolicy` constructor
  option.
* **Token redaction.** Any error the adapter throws has the PAT replaced
  with `[redacted]` before it leaves the adapter. Safe to log, safe to
  surface in UI.

Error shapes you will see:

| Error | What it means | What to do |
|---|---|---|
| `CredentialMissingError` | `.lamproom/credentials.json` has no `github` entry, or the file doesn't exist | Add the entry; re-check permissions |
| `credentials.json: mode ... broader than 0600` | POSIX permissions too permissive | `chmod 0600 .lamproom/credentials.json` |
| `credentials.json: unknown kind '...'` | The file has a `kind` your Lamproom build doesn't understand (e.g. `github_oauth` in a v1 install) | Install a newer Lamproom, or downgrade the credential |
| `Bad credentials` after retries | Token expired, revoked or wrong | Rotate the token |
| `rate limited` after `maxAttempts` | Primary rate limit exhausted (5000/hr) | Wait for `resetAt`; raise `maxAttempts` if you want more tolerance |

## Live tests

Set these env vars to run the live lane:

```bash
FLOWBOARD_LIVE=1
FLOWBOARD_LIVE_GITHUB_REPO=octokit/octokit.js   # any repo you can access
FLOWBOARD_LIVE_ROOT=/path/to/.lamproom/root     # defaults to cwd
```

```bash
node --test packages/adapters/test/github-live.test.ts \
            packages/adapters/test/markdown-live.test.ts \
            packages/adapters/test/jira-live.test.ts
```

The suite verifies a real round-trip, that `rateLimitRemaining` is reported
and non-zero, and that pagination produces disjoint pages.

## The Jira adapter (via Atlassian Rovo MCP)

Lamproom talks to Jira through Atlassian's hosted [Rovo MCP server](https://mcp.atlassian.com/v2/mcp)
over Streamable HTTP, using the `@modelcontextprotocol/sdk` client. Rovo
converts ADF descriptions to markdown server-side, so Lamproom never sees
ADF.

Two auth modes, both production-grade:

### OAuth 2.1 (recommended)

1. Open **Settings → Connections → Task providers → Jira**.
2. Click **Sign in with Atlassian**. A new tab opens the Atlassian consent
   page; approve.
3. Atlassian redirects to `/api/jira/auth/callback` and Lamproom stores
   the refresh token. The access token is refreshed automatically before
   expiry.

Scopes requested: `read:jira-work`, `read:jira-user`, `offline_access`. No
write scopes — this version is read-only.

Lamproom uses PKCE (no client secret ships with Lamproom) and a one-time
`state` parameter; a mismatched callback state is refused with a 400 and
no detail (Review Focus #1).

Tokens live in `jira.json` in your Lamproom data folder with mode `0600`.
A fresh plan handles moving them into the OS keychain.

### API token (power-user / CI fallback)

1. Create a fresh token at `https://id.atlassian.com/manage-profile/security/api-tokens`.
2. In the Jira settings page, pick the **API token** tab.
3. Enter your Atlassian base URL (https only), email, and the token.
4. Save. Optionally set a default JQL.

The token is stored in `jira.json`; the Basic-auth header is built on
every call (`Basic base64(email:token)`).

### Default JQL

The Jira settings page takes one default JQL string. If the preview or an
import later runs without specifying `?jql=`, the default is used. A good
starting point:

```
project = YOURKEY AND statusCategory != Done ORDER BY updated DESC
```

### Preview

The same page includes a preview panel. Click **Preview** to fetch the
first 10 issues via Rovo MCP and render them as a table. Errors from
Rovo are surfaced with any token already redacted by the server.

### Error shapes

| Error | Means | Fix |
|---|---|---|
| `credentials missing` (401 on preview) | `jira.json` is empty or missing the `credential` field | Sign in with Atlassian or save an API token |
| `no credentials configured` (400 on preview) | Same as above | Same |
| OAuth returns `?auth=state` | PKCE state didn't match | Click Sign-in again; don't bounce between tabs mid-flow |
| OAuth returns `?auth=exchange` | Atlassian refused the authorization code | Retry — usually transient |
| OAuth returns `?auth=no_sites` | Account has no Jira site | Log into Atlassian at least once and create a site |
| Preview returns with `[redacted]` in the error body | The adapter stripped the token from a transport error before surfacing it | Check the Jira site's rate-limit page; try again |

### Running the live test

```bash
# Ensure .lamproom/credentials.json exists with a `jira` entry:
#   { "jira": { "kind": "atlassian_api_token", "baseUrl": "https://you.atlassian.net",
#               "email": "you@example.com", "token": "ATATT..." } }
# or: the OAuth credential stored by the sign-in flow.

FLOWBOARD_LIVE=1 \
  FLOWBOARD_LIVE_JIRA_JQL='project = KAN AND statusCategory != Done' \
  node --test packages/adapters/test/jira-live.test.ts
```

## What's not here yet

Named for the follow-up plans:

* **Writes to Jira** (`jira_create_issue`, `jira_update_issue`,
  `jira_transition_issue`).
* **Jira Server / Data Center** — Rovo is Cloud-only. A sooperset-backed
  adapter lands in its own plan.
* **Multi-site OAuth picker UI** — current behaviour: first site wins.
* **OS-keychain credential storage** — OAuth refresh tokens live in
  `jira.json` plaintext for now.
* **JQL builder UI** — the settings page takes a single JQL string.
* **OAuth** for GitHub and Linear.
* **Webhook ingest** (`ingest()` on the port).
* **Linear** adapter.
* **Confluence, Bitbucket, Compass** via Rovo — the McpClient wrapper is
  reusable; each is a separate adapter plan.
* **Project-scoped credentials** — one file per project rather than one per
  installation.
* **The intake API** — `POST /api/import/backlog`, the upsert loop.

See `docs/superpowers/plans/2026-11-17-task-source-jira-mcp.md` for the
"What this plan does not finish" section.
