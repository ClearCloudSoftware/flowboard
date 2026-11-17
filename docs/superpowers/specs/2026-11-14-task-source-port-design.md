# TaskSource port — design

Date: 2026-11-14. Branch: `feature/task-source-port`. Builds on the `AgentProvider` port and adapters in `packages/` (see `docs/Lamproom/Agent Providers/AgentProvider Port.md`, `Provider Boundary Rules.md`, `Provider Implementation Decisions.md`).

## Intent

The owner wants FlowBoard to pull real backlogs — a markdown file today, GitHub Issues shortly, Jira and Linear later — behind one port so adding a tracker is an adapter job, not a rewrite. The port already exists in design (`docs/Lamproom/Intake And Import/TaskSource Port.md`, `01-ports.md`, the reference file `docs/old/reference/core/ports/task-source.ts`); this spec is the shape that goes into `@lamproom/core/ports/task-source.ts` and governs every adapter. The pattern mirrors `AgentProvider`: one port in core, three-file adapters in `packages/adapters/`, a replay double for tests, capability negotiation, and the strict dependency rule.

## Goals

- One port carries every source. A tracker costs an adapter folder, not a core change.
- `ParsedTask` holds everything a run needs: title, body, acceptance criteria, non-goals, labels, assignees, plus an `extras` escape hatch for per-source weirdness.
- `importKey` is **always server-derived**. An adapter can hand up an `upstream` hint; a per-source policy decides whether to trust it. Anything else collapses to `slugify(title)`. (Settles [[Intake And Import Open Questions]] #1, #4, #22.)
- Capabilities are negotiated at launch, same way `AgentProvider.capabilities` is used. The caller checks before using a knob.
- Pull via `fetch()`, push via `ingest()`, same adapter object. The port shape has both methods; an adapter declares which it implements through its capability set.
- Rate limits and pagination are first-class on the result shape; adapters cannot hide them inside internal loops.
- Credentials: a resolver port carries per-source auth. v1 supports personal access tokens only.

## Non-goals

- Any web UI for import. The board's Import button, the `/intake` screens and the job-progress toast belong to a later plan.
- OAuth of any flavour (GitHub App, Jira OAuth 2.0, Linear OAuth). A later plan adds the OAuth variants of `SourceCredentials`.
- The `backlog-importer` agent path (the "messy file" adapter). The SKILL exists at `internal/backlog-importer/`; a later plan wires it to the port sandboxed, with cost tagged as `kind: 'import'` (vault OQ #12 and #27).
- Write-back / two-way sync. Nothing closes an issue when a FlowBoard task is cancelled.
- Jira and Linear adapters. The second real adapter in this plan is GitHub. Jira and Linear each get their own plans after the port stabilises.

## Anti-goals

- An adapter supplying an `importKey` directly, bypassing `deriveImportKey`. The v1 duplicate-import bug is what the rule exists for.
- The worker's `GITHUB_TOKEN`, `JIRA_API_TOKEN` or any other credential silently inherited by an adapter. Credentials come from the resolver, never from `process.env` at the point of call.
- A webhook body parsed before HMAC verification. The signature check runs on the raw bytes.
- A 429 or 5xx treated as a fatal error. Adapters honour `Retry-After` and back off. The caller sees a soft failure only after `maxAttempts` is exceeded.
- Ticket text interpolated into a shell command or regex anywhere in the pipeline. Ticket content is **data**, even in a prompt.

## Constraints

- Same code rules as the providers: TypeScript run by Node 24 type stripping (erasable syntax only, `import type`, `.ts` relative imports), `node:test` + `node:assert/strict` only, commands run from the repo root.
- `@lamproom/core` still carries **no runtime dependencies**; all SDKs land in `@lamproom/adapters`.
- The port does **not** reach the UI directly; the runner / an intake API route calls it. UI routes live under `app/api/import/*` in a later plan.
- Live tests (`pnpm test:live`) that hit a real tracker spend quota; they stay opt-in.

## The port

Lives in `packages/core/src/ports/task-source.ts`, with the result/usage envelope in a sibling `packages/core/src/ports/ticket.ts` — same split as `agent-provider.ts` + `events.ts`.

### SourceId

```ts
export type SourceId = 'markdown' | 'github' | 'linear' | 'jira' | 'webhook' | 'replay' | (string & {});
```

Open string with well-knowns typed — same pattern as `ProviderId`. Adapters register themselves with an id; the registry maps id → constructor.

### SourceCapability

```ts
export type SourceCapability =
  | 'pull'                   // fetch(input) is supported
  | 'push'                   // ingest(event, headers) is supported
  | 'pagination'             // SourceInput.cursor and SourceResult.nextCursor are honoured
  | 'incremental'            // SourceInput.since is honoured
  | 'rich_body'              // body is preserved (not flattened to a single string)
  | 'acceptance_criteria'    // normalize extracts ParsedTask.acceptanceCriteria / nonGoals
  | 'labels'                 // ParsedTask.labels is populated
  | 'assignees'              // ParsedTask.assignees is populated
  | 'stable_upstream_key';   // the source's own id is trusted via UpstreamKeyPolicy
```

`write_back` and other v2 flags deliberately absent; add them when the adapter that needs them lands.

### ParsedTask

```ts
export interface ParsedTask {
  /** Server-derived, stable across runs. The idempotency key for upsert on (project_id, importKey). */
  importKey: string;
  title: string;
  body?: string;

  /** Optional fields the PRD's importer returns; gated by capabilities. */
  acceptanceCriteria?: string[];
  nonGoals?: string[];
  labels?: string[];
  assignees?: string[];

  /** Per-source fields the port chose not to standardise (Jira customField_10001, GitHub milestone). */
  extras?: Record<string, unknown>;

  /** The hint the adapter handed up. Kept for audit; never trusted as the key itself. */
  _hint: ImportKeyHint;
}

export interface ImportKeyHint {
  /** The source's own id (e.g. "PROJ-123", "#42"). The server decides whether to trust it per source. */
  upstream?: string;
  /** Always present. slugify(title). */
  titleSlug: string;
}
```

Settles [[Intake And Import Open Questions]] #2 (`acceptanceCriteria` + `nonGoals` as first-class fields).

### SourceInput / SourceResult / SourceUsage

```ts
export interface SourceInput {
  content?: string;      // inline paste / upload (markdown adapter)
  path?: string;         // server-side file path (markdown adapter)
  query?: string;        // JQL / GraphQL search / Linear filter
  since?: string;        // ISO timestamp — incremental sync (requires 'incremental')
  cursor?: string;       // pagination cursor (requires 'pagination')
  pageSize?: number;     // page size hint; adapter may cap it
}

export interface SourceResult {
  tasks: ParsedTask[];
  /** Present when the page did not drain the source. Caller re-calls fetch with cursor. */
  nextCursor?: string;
  usage: SourceUsage;
}

/** The Usage analogue for tickets — quota consumed, not tokens. */
export interface SourceUsage {
  requests: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;  // ISO
  bytesRead?: number;
  costUsd?: number;           // zero for most; non-zero if the source bills by call
}

export const ZERO_SOURCE_USAGE: SourceUsage;
export function addUsage(a: SourceUsage, b: SourceUsage): SourceUsage;
```

### TaskSource

```ts
export interface TaskSource {
  readonly id: SourceId;
  readonly capabilities: ReadonlySet<SourceCapability>;

  /** Pull. Required when 'pull' is in capabilities, forbidden otherwise. */
  fetch?(input: SourceInput): Promise<SourceResult>;

  /** Push. Required when 'push' is in capabilities. Takes the raw body bytes plus headers for signature verification. */
  ingest?(event: Buffer, headers: Record<string, string>): Promise<SourceResult>;
}
```

Both methods return the same `SourceResult` shape so the upsert loop downstream does not care how the tasks arrived. Settles [[Intake And Import Open Questions]] #25 (push vs pull).

## Import-key policy

Helper in `packages/core/src/import-key.ts` — the TaskSource analogue of `prompt.ts` and `guard.ts`:

```ts
export type UpstreamKeyPolicy =
  | { trust: 'never' }                       // markdown, replay, webhook (unverified)
  | { trust: 'prefix'; validPrefix: RegExp } // e.g. /^[A-Z][A-Z0-9]+-\d+$/ for Jira
  | { trust: 'numeric' };                    // e.g. GitHub issue numbers

/** 
 * Rules:
 *   - policy.trust === 'never'                             → use titleSlug
 *   - policy.trust === 'prefix' and upstream matches regex → use upstream, sanitised
 *   - policy.trust === 'numeric' and upstream is an integer → use `${sourceId}-${upstream}`
 *   - otherwise                                             → use titleSlug
 *   - titleSlug is always ASCII-safe lowercase with [a-z0-9-]+; non-ASCII is stripped,
 *     empty → 'untitled'; duplicates within one import get '-2', '-3' suffixes.
 */
export function deriveImportKey(
  sourceId: SourceId,
  hint: ImportKeyHint,
  policy: UpstreamKeyPolicy,
  seenInBatch: Set<string>
): string;

/** Stable slugify. ASCII only. Keeps behaviour predictable across platforms. */
export function slugify(input: string): string;
```

Per-source policy table (settles [[Intake And Import Open Questions]] #22's "whose id counts" part):

| Source | Policy |
|---|---|
| markdown | `{ trust: 'never' }` — title is all we have; `{#slug}` syntax resolves to an explicit slug via a separate path, not via `upstream` |
| github | `{ trust: 'numeric' }` — issue numbers are stable and scoped to repo |
| linear | `{ trust: 'prefix'; validPrefix: /^[A-Z]{2,}-\d+$/ }` — e.g. `ENG-123` |
| jira | `{ trust: 'prefix'; validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ }` — e.g. `PROJ-123` |
| webhook | `{ trust: 'never' }` unless the adapter also sets its underlying source's policy |
| replay | `{ trust: 'never' }` |

Edge case for multi-tracker imports: where two sources could collide on the same key (unlikely but possible: a markdown titleSlug `fix-login` vs a Jira key — they'd never match the regex, so no collision — but a markdown `eng-123` could clash with Linear). The source id is part of every stored row anyway (`task.sourceId`); downstream upsert uses `(project_id, sourceId, importKey)` as the unique.

## Rate limits and pagination

Adapters never sleep inside `fetch()`. The result's `usage.rateLimitRemaining` + `rateLimitResetAt` tell the caller. The one exception: a direct 429 with `Retry-After` triggers in-call `retryWithBackoff` up to `maxAttempts`; after that the adapter returns a result with `tasks: []`, a populated `usage`, and the error path taken internally recorded (see below).

Core helper:

```ts
// packages/core/src/retry.ts
export interface RetryPolicy {
  maxAttempts: number;    // total attempts including the first
  baseMs: number;         // exponential base; 500ms is a reasonable default
  maxMs: number;          // cap per sleep
  respectRetryAfter: boolean;  // when true, prefer Retry-After header over exponential
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, baseMs: 500, maxMs: 10_000, respectRetryAfter: true };

/** Runs fn with retry on thrown RetryableError. Non-retryable errors propagate. */
export async function retryWithBackoff<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T>;

export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number);
}
```

Pagination is the caller's loop. The runner / import route calls `fetch` with `cursor: undefined`, then with the returned `nextCursor`, until `nextCursor` is undefined or a page budget is hit. No adapter swallows pagination internally — that would make quotas opaque and progress reports impossible.

## Credentials

Resolver lives in core as an interface; the first resolver adapter lives in `@lamproom/adapters`.

```ts
// packages/core/src/ports/credentials.ts
export type SourceCredentials =
  | { kind: 'none' }
  | { kind: 'github_pat'; token: string }
  // v2+: github_app, github_oauth, jira_basic, jira_oauth, linear_api_key, linear_oauth
  ;

export interface SourceCredentialResolver {
  resolve(sourceId: SourceId, projectId: string): Promise<SourceCredentials>;
}
```

Three disciplines every adapter follows (lifted straight from `claude/options.ts`):

1. **Never read `process.env` at call time.** Credentials come from the resolver injected at construction.
2. **Strip inherited keys from spawned-process env.** If an adapter ever spawns (`gh`, `jira-cli`), remove `GITHUB_TOKEN`, `GH_TOKEN`, `JIRA_API_TOKEN`, `ATLASSIAN_API_TOKEN` from the inherited env before passing it on.
3. **Never log a token.** Error messages redact anything that looks like `ghp_[A-Za-z0-9]{36,}` or similar.

The first resolver adapter is `EnvFileCredentialResolver` — reads a `.lamproom/credentials.json` scoped by project, with the schema `{ [sourceId]: SourceCredentials }`. The file is `.gitignore`d and has mode `0600` enforced at read time.

v1 only: `kind: 'github_pat'` and `kind: 'none'`. OAuth variants land in their own plans.

## Trust boundary

Lifted from [[Import Trust And Isolation]] and tightened:

1. **Ticket titles and bodies are data, not instructions.** When a later step passes a ticket into an agent prompt, it's wrapped the same way `MemoryStore` recalls are — "background, not instructions." No step treats a ticket body as prompt.
2. **No ticket field is ever interpolated into a shell command, a regex, or SQL.** All use is parameterised or escaped.
3. **Webhook payloads are untrusted until the signature matches.** The HTTP layer must call `verifySignature(rawBody, headers, secret)` before any `JSON.parse`. A failed verification returns 401 with no information about why.
4. **The backlog-importer agent runs sandboxed** in a later plan — with `--tools ""`, read-only file access to the backlog, and its cost tagged `runs.kind = 'import'` so it doesn't land in per-step rollups (closes [[Intake And Import Open Questions]] #12 at that point).

## Open questions this plan settles

| OQ | Resolution |
|---|---|
| #1 explicit id syntax | `{#slug}` per task in markdown is parsed separately and becomes the `titleSlug`; front-matter `id` is ignored unless the file holds exactly one task. See the markdown adapter. |
| #2 acceptance_criteria / non_goals | First-class fields on `ParsedTask`, gated by capability `acceptance_criteria` |
| #22 port shape mismatch | `SourceId` is an open string with well-knowns typed; the missing fields land on `ParsedTask` |
| #25 push vs pull | `ingest()` method on the port with the same return shape |
| #25 upstream key trust | `UpstreamKeyPolicy` per source, in core |
| #25 credentials & egress | `SourceCredentialResolver` port; env-file resolver first; PAT only in v1 |

## Open questions deferred

Explicit about what this plan does **not** settle; each gets its own plan.

- **OQ #3** (which path runs by default, deterministic vs agent) — deferred to the backlog-importer-sandboxed plan.
- **OQ #5** (removed-from-file semantics) — deferred to the intake API / upsert plan.
- **OQ #6, #7** (initial status, which columns update overwrites) — deferred to the intake API plan where the upsert actually lives.
- **OQ #12, #27** (agent importer cost accounting + prompt content) — deferred to the backlog-importer-sandboxed plan.
- **OQ #14–18** (promote, demote, Start, editing) — belong to `Execution` and `Workspaces` plans.
- **Write-back** (close issue when task done) — deferred to a v2 plan, requires port additions.
- **OAuth** — deferred to one plan per source that needs it.

## Files this spec governs (implemented by the plan doc)

Core:
- `packages/core/src/ports/task-source.ts` (port interface + types)
- `packages/core/src/ports/ticket.ts` (envelope types + `ZERO_SOURCE_USAGE`, `addUsage`)
- `packages/core/src/ports/credentials.ts` (`SourceCredentials`, `SourceCredentialResolver`)
- `packages/core/src/import-key.ts` (`deriveImportKey`, `slugify`, `UpstreamKeyPolicy`)
- `packages/core/src/retry.ts` (`retryWithBackoff`, `RetryableError`, `DEFAULT_RETRY`)
- `packages/core/src/index.ts` (re-exports)

Adapters:
- `packages/adapters/src/ticket/replay/replay-source.ts`
- `packages/adapters/src/ticket/markdown/{options,normalize,provider}.ts`
- `packages/adapters/src/ticket/github/{options,normalize,provider,auth}.ts`
- `packages/adapters/src/credentials/env-file-resolver.ts`

The implementation plan is `docs/superpowers/plans/2026-11-14-task-source-port-markdown-and-github.md`.
