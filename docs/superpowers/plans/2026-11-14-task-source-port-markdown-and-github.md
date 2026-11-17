# Task Source — port, markdown and GitHub Issues implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `TaskSource` port, the `deriveImportKey` and `retryWithBackoff` core helpers, the `SourceCredentialResolver` port with an env-file adapter, a `ReplayTaskSource` test double, the markdown adapter (reference parser), and a GitHub Issues adapter that pulls issues via `@octokit/graphql` using a personal access token.

**Architecture:** Three workspace packages inside the repo root. `@lamproom/core` gains the port types and three provider-neutral helpers (`deriveImportKey`, `slugify`, `retryWithBackoff`) and still has no runtime dependencies. `@lamproom/adapters` gains the ticket adapters and the credential resolver. Each real adapter is three files — `options.ts` maps `SourceInput` to the native request (pure), `normalize.ts` maps a native ticket to a `ParsedTask` (pure), and `provider.ts` wires them to the SDK and exposes `TaskSource`. The ReplayTaskSource is a single file that replays a scripted `SourceResult[]`. The dependency rule stays: the UI, the runner and `@lamproom/cli` only import from `@lamproom/core`.

**Tech Stack:** TypeScript 5.9 run directly by Node 24 type stripping (no build step), `node:test`, pnpm 10 workspaces, `@octokit/graphql` 8.x for GitHub, `remark` + `remark-parse` for markdown parsing (both already erasable).

**Spec:** `docs/superpowers/specs/2026-11-14-task-source-port-design.md` — source of truth for every type.
Reference docs: `docs/Lamproom/Intake And Import/TaskSource Port.md`, `Markdown Task Source.md`, `Backlog File Shapes.md`, `Import Key.md`, `Idempotent Upsert.md`, `Future Task Sources.md`, `Intake And Import Open Questions.md`.
Reference code: `docs/old/reference/core/ports/task-source.ts`, `docs/old/reference/adapters/source/markdown/markdown-source.ts` (run its tests to compare parser behaviour).

## Global Constraints

- Work on branch `feature/task-source-port`, branched from `dev` (already created).
- All commands run from the repo root unless stated.
- Node 24, no build step: only erasable TypeScript (no `enum`, no parameter properties, no `namespace`); type-only imports use `import type`; relative imports carry the `.ts` extension.
- `@lamproom/core` has **no** `dependencies` and never imports `@lamproom/adapters` (the dependency rule in `Provider Boundary Rules.md`).
- Tests use `node:test` and `node:assert/strict` only. No test framework.
- Pin `@octokit/graphql` to exactly `8.1.1`. Pin `remark-parse` to `11.0.0` and `unified` to `11.0.5`.
- Credentials never read from `process.env` at call time; they come from the resolver. The worker's `GITHUB_TOKEN`, `GH_TOKEN`, `JIRA_API_TOKEN`, `ATLASSIAN_API_TOKEN` are stripped from any inherited env before an adapter spawns a child.
- Out of scope: OAuth of any flavour; webhooks and the `ingest()` method's wiring to an HTTP route; the backlog-importer agent's sandboxed invocation; any UI (board Import button, `/intake`, settings page); the upsert loop itself and the `tasks` table migration. The port **supports** `ingest` on the interface (so a later plan can land a webhook adapter without a port change), but no adapter in this plan implements it.

## Port decisions this plan makes

These settle Intake And Import Open Questions #1, #2, #22, #25 and parts of #4; Task 8 records them in the vault.

| Decision | Settles |
|---|---|
| `SourceId` is an open string with well-knowns typed (`'markdown' \| 'github' \| … \| (string & {})`) | #22 |
| `ParsedTask` gains `acceptanceCriteria?: string[]`, `nonGoals?: string[]`, `labels?: string[]`, `assignees?: string[]`, `extras?: Record<string, unknown>` and a kept `_hint: ImportKeyHint` | #2 |
| `fetch()` returns `{ tasks, nextCursor?, usage }`; pagination is the caller's loop | — |
| `ingest(event: Buffer, headers: Record<string, string>)` is the second entry point on the port interface; no adapter in this plan implements it | #25 (shape) |
| `SourceCapability` enum carries nine flags; a caller checks the set before using a knob. Renamed from `Capability` to avoid collision with `AgentProvider.Capability`. | — |
| `importKey` is always `deriveImportKey(sourceId, hint, policy, seen)`; adapters never set it directly | #1, #4 (partly), vault rule |
| Per-source `UpstreamKeyPolicy` lives in each adapter's `provider.ts`; markdown + replay + webhook use `{ trust: 'never' }`, github uses `{ trust: 'numeric' }` | #22 (whose id counts) |
| `slugify` is ASCII-only, lowercase `[a-z0-9-]+`, non-ASCII stripped, empty → `'untitled'`, within-batch collisions get `-2`, `-3` suffixes | observed-#10 edge case |
| `SourceCredentials` union starts at `{ kind: 'none' } \| { kind: 'github_pat'; token: string }`; OAuth variants land in later plans | #25 (credentials) |
| `retryWithBackoff` honours `Retry-After` when `respectRetryAfter` is true; defaults `{ maxAttempts: 3, baseMs: 500, maxMs: 10_000 }` | — |

## Review Focus

Five specific test cases that catch the hardest bugs. Each lands in a named test in the plan below.

1. **Re-import changes the title; same `_hint.upstream` → still one row.** With `github` policy, `deriveImportKey` prefers the numeric upstream, so a title edit does not create a duplicate. Test: Task 2, `uses upstream when policy allows and upstream matches`.
2. **A 429 with `Retry-After: 30` waits 30 seconds, not an exponential back-off.** `retryWithBackoff` respects the header. Test: Task 3, `respects Retry-After header over exponential`.
3. **Missing credential fails before any network call.** The GitHub provider calls `resolver.resolve` in `fetch()`; if the result is `{ kind: 'none' }`, it throws `CredentialMissingError` before building the Octokit request. Test: Task 7, `throws CredentialMissingError before any network call when credentials are 'none'`.
4. **Pagination terminates when `hasNextPage` is false.** The caller's loop (simulated in the test) stops; the provider does not loop internally. Test: Task 7, `nextCursor is undefined when GraphQL page has hasNextPage false`.
5. **Untrusted body never interpolated.** The markdown normalizer puts a body with backticks, `$(…)` and shell metacharacters into `ParsedTask.body` verbatim; nothing escapes or executes. Test: Task 5, `preserves body content verbatim including shell-metacharacters`.

---

### Task 1: Core port types

**Files:**
- Create: `packages/core/src/ports/task-source.ts`
- Create: `packages/core/src/ports/ticket.ts`
- Create: `packages/core/src/ports/credentials.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/task-source-types.test.ts` (type-level smoke)

**Interfaces:**
- Produces (all re-exported from `@lamproom/core`):
  - `type SourceId`, `type SourceCapability`
  - `interface ParsedTask`, `interface ImportKeyHint`
  - `interface SourceInput`, `interface SourceResult`, `interface SourceUsage`
  - `interface TaskSource`
  - `type SourceCredentials`, `interface SourceCredentialResolver`
  - `const ZERO_SOURCE_USAGE: SourceUsage`
  - `function addUsage(a: SourceUsage, b: SourceUsage): SourceUsage`

- [ ] **Step 1: Write the failing smoke test**

```ts
// packages/core/test/task-source-types.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZERO_SOURCE_USAGE, addUsage } from '../src/ports/ticket.ts';

test('ZERO_SOURCE_USAGE has zero requests', () => {
  assert.equal(ZERO_SOURCE_USAGE.requests, 0);
});

test('addUsage sums requests and bytesRead and takes the lower rateLimitRemaining', () => {
  const sum = addUsage(
    { requests: 2, rateLimitRemaining: 4500, bytesRead: 1000 },
    { requests: 3, rateLimitRemaining: 4480, bytesRead: 2500 },
  );
  assert.equal(sum.requests, 5);
  assert.equal(sum.bytesRead, 3500);
  assert.equal(sum.rateLimitRemaining, 4480);
});

test('addUsage keeps the later rateLimitResetAt when both present', () => {
  const sum = addUsage(
    { requests: 1, rateLimitResetAt: '2026-11-14T10:00:00Z' },
    { requests: 1, rateLimitResetAt: '2026-11-14T10:05:00Z' },
  );
  assert.equal(sum.rateLimitResetAt, '2026-11-14T10:05:00Z');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test packages/core/test/task-source-types.test.ts`
Expected: `ERR_MODULE_NOT_FOUND` for `../src/ports/ticket.ts`.

- [ ] **Step 3: Implement the three port files**

Write the three files per the spec's "The port" and "Credentials" sections. `task-source.ts` carries the interface, `SourceId`, `SourceCapability`, `ParsedTask`, `ImportKeyHint`, `SourceInput`, `SourceResult`. `ticket.ts` carries `SourceUsage`, `ZERO_SOURCE_USAGE`, `addUsage`. `credentials.ts` carries `SourceCredentials` and `SourceCredentialResolver`. All types; no runtime side effects except the two exports in `ticket.ts`.

`index.ts` re-exports: `./ports/task-source.ts`, `./ports/ticket.ts`, `./ports/credentials.ts`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test packages/core/test/task-source-types.test.ts && pnpm typecheck:packages`
Expected: 3 tests pass, `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports/task-source.ts packages/core/src/ports/ticket.ts packages/core/src/ports/credentials.ts packages/core/src/index.ts packages/core/test/task-source-types.test.ts
git commit -m "feat(core): TaskSource port and ticket envelope types"
```

---

### Task 2: `deriveImportKey` + `slugify` + `UpstreamKeyPolicy`

**Files:**
- Create: `packages/core/src/import-key.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/import-key.test.ts`

**Interfaces:**
- Produces:
  - `type UpstreamKeyPolicy`
  - `function slugify(input: string): string`
  - `function deriveImportKey(sourceId: SourceId, hint: ImportKeyHint, policy: UpstreamKeyPolicy, seenInBatch: Set<string>): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/import-key.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveImportKey, slugify } from '../src/import-key.ts';

test('slugify lowercases and dashes ASCII', () => {
  assert.equal(slugify('Rotate refresh tokens on every use'), 'rotate-refresh-tokens-on-every-use');
});

test('slugify strips non-ASCII and collapses', () => {
  assert.equal(slugify('日本語 title'), 'title');
  assert.equal(slugify('   —  '), 'untitled');
  assert.equal(slugify('Hello!!! world??'), 'hello-world');
});

test('policy never → always titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('markdown', { upstream: '42', titleSlug: 'fix-login' }, { trust: 'never' }, seen),
    'fix-login',
  );
});

test('policy numeric with integer upstream → sourceId-upstream', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('github', { upstream: '42', titleSlug: 'fix-login' }, { trust: 'numeric' }, seen),
    'github-42',
  );
});

test('policy numeric with non-integer upstream → falls back to titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('github', { upstream: 'abc', titleSlug: 'fix-login' }, { trust: 'numeric' }, seen),
    'fix-login',
  );
});

test('policy prefix with matching key → upstream, sanitised', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('jira', { upstream: 'PROJ-123', titleSlug: 'x' }, { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ }, seen),
    'proj-123',
  );
});

test('duplicate within batch gets -2 then -3', () => {
  const seen = new Set<string>();
  const a = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  const b = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  const c = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  assert.equal(a, 'same');
  assert.equal(b, 'same-2');
  assert.equal(c, 'same-3');
});

test('uses upstream when policy allows and upstream matches (Review Focus #1)', () => {
  // Title edit: same hint.upstream, different titleSlug — key stays the same.
  const seen = new Set<string>();
  const first  = deriveImportKey('github', { upstream: '42', titleSlug: 'fix-login' },         { trust: 'numeric' }, seen);
  const second = deriveImportKey('github', { upstream: '42', titleSlug: 'fix-the-login-bug' }, { trust: 'numeric' }, new Set());
  assert.equal(first, second);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test packages/core/test/import-key.test.ts` — `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `import-key.ts`**

Behaviour (verbatim from spec):
- `slugify`: lowercase, strip accents, replace any `[^a-z0-9]+` with `-`, trim leading/trailing `-`; empty → `'untitled'`.
- `deriveImportKey`: walks the policy; for `numeric`, require `/^\d+$/`, key is `${sourceId}-${upstream}`; for `prefix`, require regex match, key is `slugify(upstream)`; otherwise fall through to `slugify(hint.titleSlug)` (slugify is idempotent). Then check `seenInBatch` and append `-2`, `-3`, … on collision. Add to `seenInBatch` before returning.

`index.ts` re-exports `./import-key.ts`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test packages/core/test/import-key.test.ts && pnpm typecheck:packages`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/import-key.ts packages/core/src/index.ts packages/core/test/import-key.test.ts
git commit -m "feat(core): deriveImportKey with per-source upstream trust policy"
```

---

### Task 3: `retryWithBackoff` + `RetryableError`

**Files:**
- Create: `packages/core/src/retry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/retry.test.ts`

**Interfaces:**
- Produces:
  - `interface RetryPolicy { maxAttempts: number; baseMs: number; maxMs: number; respectRetryAfter: boolean }`
  - `const DEFAULT_RETRY: RetryPolicy`
  - `class RetryableError extends Error { retryAfterMs?: number }`
  - `function retryWithBackoff<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/retry.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryWithBackoff, RetryableError, DEFAULT_RETRY } from '../src/retry.ts';

test('returns on first success without delay', async () => {
  const start = Date.now();
  const got = await retryWithBackoff(async () => 'ok', DEFAULT_RETRY);
  assert.equal(got, 'ok');
  assert.ok(Date.now() - start < 50);
});

test('retries up to maxAttempts on RetryableError', async () => {
  let n = 0;
  const got = await retryWithBackoff(async () => {
    if (++n < 3) throw new RetryableError('nope');
    return n;
  }, { ...DEFAULT_RETRY, baseMs: 1, maxMs: 1 });
  assert.equal(got, 3);
});

test('throws after maxAttempts exhausted', async () => {
  let n = 0;
  await assert.rejects(
    retryWithBackoff(async () => { n++; throw new RetryableError('nope'); }, { ...DEFAULT_RETRY, maxAttempts: 2, baseMs: 1, maxMs: 1 }),
    (e: Error) => e.message === 'nope',
  );
  assert.equal(n, 2);
});

test('non-RetryableError propagates immediately', async () => {
  let n = 0;
  await assert.rejects(
    retryWithBackoff(async () => { n++; throw new Error('fatal'); }, { ...DEFAULT_RETRY, baseMs: 1 }),
    (e: Error) => e.message === 'fatal',
  );
  assert.equal(n, 1);
});

test('respects Retry-After header over exponential (Review Focus #2)', async () => {
  let n = 0;
  const start = Date.now();
  await retryWithBackoff(async () => {
    if (n++ === 0) throw new RetryableError('429', 100);  // retryAfterMs: 100
    return true;
  }, { maxAttempts: 2, baseMs: 10, maxMs: 10, respectRetryAfter: true });
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 95, `expected ~100ms wait, got ${elapsed}`);
  assert.ok(elapsed < 200, `wait too long: ${elapsed}`);
});
```

- [ ] **Step 2: Run it to verify it fails** — `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement**

Pseudocode:
```
for attempt = 1..maxAttempts:
  try return await fn()
  catch e:
    if !(e instanceof RetryableError) throw e
    if attempt === maxAttempts throw e
    let wait = (policy.respectRetryAfter && e.retryAfterMs !== undefined)
             ? e.retryAfterMs
             : min(baseMs * 2^(attempt-1), maxMs)
    await delay(wait)
```

`DEFAULT_RETRY = { maxAttempts: 3, baseMs: 500, maxMs: 10_000, respectRetryAfter: true }`.

- [ ] **Step 4: Run and pass**

`node --test packages/core/test/retry.test.ts` — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/retry.ts packages/core/src/index.ts packages/core/test/retry.test.ts
git commit -m "feat(core): retryWithBackoff with Retry-After support"
```

---

### Task 4: Env-file credential resolver

**Files:**
- Create: `packages/adapters/src/credentials/env-file-resolver.ts`
- Modify: `packages/adapters/src/index.ts` (re-export)
- Test: `packages/adapters/test/env-file-resolver.test.ts`

**Interfaces:**
- Consumes: `SourceCredentials`, `SourceCredentialResolver` (from `@lamproom/core`)
- Produces: `class EnvFileCredentialResolver implements SourceCredentialResolver` with constructor `({ root: string; projectIdToDir?: (id: string) => string })`

- [ ] **Step 1: Write the failing test**

```ts
// packages/adapters/test/env-file-resolver.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';

test('resolves github_pat from .lamproom/credentials.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  await writeFile(join(root, '.lamproom/credentials.json'), JSON.stringify({ github: { kind: 'github_pat', token: 'ghp_xxx' } }), { mode: 0o600 });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('github', 'default');
  assert.deepEqual(got, { kind: 'github_pat', token: 'ghp_xxx' });
});

test('returns { kind: "none" } when the file is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  const r = new EnvFileCredentialResolver({ root });
  assert.deepEqual(await r.resolve('github', 'default'), { kind: 'none' });
});

test('returns { kind: "none" } when the source is not configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  await writeFile(join(root, '.lamproom/credentials.json'), JSON.stringify({}), { mode: 0o600 });
  const r = new EnvFileCredentialResolver({ root });
  assert.deepEqual(await r.resolve('github', 'default'), { kind: 'none' });
});

test('refuses to read a file with mode broader than 0600', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  const path = join(root, '.lamproom/credentials.json');
  await writeFile(path, '{}', { mode: 0o644 });
  await chmod(path, 0o644);
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), /mode/);
});
```

- [ ] **Step 2: Run and fail**

- [ ] **Step 3: Implement**

Behaviour:
- Default path: `${root}/.lamproom/credentials.json`. Project-scoped variant (via `projectIdToDir`) lands later; v1 reads the single root-scoped file.
- On Windows, skip the mode check (NTFS perms don't map); on POSIX, `statSync` and reject if `(mode & 0o077) !== 0`.
- Parse JSON; return the entry for `sourceId`, or `{ kind: 'none' }` when missing. Return `{ kind: 'none' }` on `ENOENT`.
- Never log the token. Errors mention the path and the reason (`'file mode broader than 0600'`, `'JSON parse failed'`) but never a value.

- [ ] **Step 4: Run and pass** — 4 tests pass (3 on Windows if the mode test is skipped under `process.platform === 'win32'`).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/credentials/env-file-resolver.ts packages/adapters/src/index.ts packages/adapters/test/env-file-resolver.test.ts
git commit -m "feat(adapters): EnvFileCredentialResolver with 0600 mode enforcement"
```

---

### Task 5: `ReplayTaskSource`

**Files:**
- Create: `packages/adapters/src/ticket/replay/replay-source.ts`
- Modify: `packages/adapters/src/index.ts`
- Test: `packages/adapters/test/replay-source.test.ts`

**Interfaces:**
- Consumes: `TaskSource`, `SourceInput`, `SourceResult`, `ParsedTask`, `SourceCapability`, `ZERO_SOURCE_USAGE` (from `@lamproom/core`)
- Produces: `class ReplayTaskSource implements TaskSource` with constructor `({ script: SourceResult[]; capabilities?: Set<SourceCapability> })`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReplayTaskSource } from '../src/ticket/replay/replay-source.ts';

test('yields scripted pages in order and stops', async () => {
  const src = new ReplayTaskSource({ script: [
    { tasks: [{ importKey: 'a', title: 'A', _hint: { titleSlug: 'a' } }], nextCursor: 'c1', usage: { requests: 1 } },
    { tasks: [{ importKey: 'b', title: 'B', _hint: { titleSlug: 'b' } }], usage: { requests: 1 } },
  ]});
  const p1 = await src.fetch!({});
  assert.equal(p1.tasks[0].importKey, 'a');
  assert.equal(p1.nextCursor, 'c1');
  const p2 = await src.fetch!({ cursor: 'c1' });
  assert.equal(p2.tasks[0].importKey, 'b');
  assert.equal(p2.nextCursor, undefined);
});

test('rejects fetch past the end of the script', async () => {
  const src = new ReplayTaskSource({ script: [{ tasks: [], usage: { requests: 0 } }] });
  await src.fetch!({});
  await assert.rejects(src.fetch!({}), /script exhausted/);
});

test('defaults to { pull } capability', () => {
  const src = new ReplayTaskSource({ script: [] });
  assert.ok(src.capabilities.has('pull'));
  assert.equal(src.capabilities.has('push'), false);
});
```

- [ ] **Step 2: Run and fail**

- [ ] **Step 3: Implement**

Behaviour:
- `id = 'replay'`.
- `capabilities = opts.capabilities ?? new Set(['pull'])`.
- `fetch(input)` pops the next scripted result; throws when the script is exhausted.
- If `capabilities` includes `'push'`, implement `ingest()` by popping the next scripted result too (useful for webhook adapter tests later).
- No I/O; tests run in <5 ms.

- [ ] **Step 4: Run and pass** — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/ticket/replay/replay-source.ts packages/adapters/src/index.ts packages/adapters/test/replay-source.test.ts
git commit -m "feat(adapters): ReplayTaskSource for deterministic tests"
```

---

### Task 6: Markdown adapter

**Files:**
- Create: `packages/adapters/src/ticket/markdown/options.ts`
- Create: `packages/adapters/src/ticket/markdown/normalize.ts`
- Create: `packages/adapters/src/ticket/markdown/provider.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/package.json` — add `unified`, `remark-parse`
- Test: `packages/adapters/test/markdown-normalize.test.ts`
- Test: `packages/adapters/test/markdown-provider.test.ts`
- Test fixture: `packages/adapters/test/fixtures/markdown/sample.md`
- Test fixture: `packages/adapters/test/fixtures/markdown/sample.expected.json`

**Interfaces:**
- Consumes: `TaskSource`, `SourceInput`, `SourceResult`, `ParsedTask`, `ZERO_SOURCE_USAGE`, `deriveImportKey`, `slugify` (from `@lamproom/core`)
- Produces:
  - `resolveInput(input: SourceInput): { content: string; label: string }` in `options.ts` (pure)
  - `parseMarkdown(content: string, sourceId: SourceId): ParsedTask[]` in `normalize.ts` (pure — note: it calls `deriveImportKey` internally with the markdown policy)
  - `class MarkdownTaskSource implements TaskSource` in `provider.ts` (I/O: reads `input.path` when given)

- [ ] **Step 1: Write the failing normalize test**

The fixture `sample.md`:
```markdown
# Not a task — only ## counts

## Rotate refresh tokens on every use

Short description.

### Acceptance criteria
- Users keep their session across the rotation.
- No window where both tokens are valid.

### Non-goals
- Revoking old tokens from other devices.

## Backfill the audit log {#backfill}

Historical rows need the new columns.

## Rotate refresh tokens on every use

A second task with the same title lands with a `-2` key.
```

The expected JSON:
```json
[
  { "importKey": "rotate-refresh-tokens-on-every-use",
    "title": "Rotate refresh tokens on every use",
    "body": "Short description.",
    "acceptanceCriteria": ["Users keep their session across the rotation.", "No window where both tokens are valid."],
    "nonGoals": ["Revoking old tokens from other devices."],
    "_hint": { "titleSlug": "rotate-refresh-tokens-on-every-use" } },
  { "importKey": "backfill",
    "title": "Backfill the audit log",
    "body": "Historical rows need the new columns.",
    "_hint": { "titleSlug": "backfill-the-audit-log", "upstream": "backfill" } },
  { "importKey": "rotate-refresh-tokens-on-every-use-2",
    "title": "Rotate refresh tokens on every use",
    "body": "A second task with the same title lands with a `-2` key.",
    "_hint": { "titleSlug": "rotate-refresh-tokens-on-every-use" } }
]
```

Test:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseMarkdown } from '../src/ticket/markdown/normalize.ts';

test('parses PRD backlog shapes with acceptance_criteria and non_goals', async () => {
  const content = await readFile(join(import.meta.dirname, 'fixtures/markdown/sample.md'), 'utf8');
  const expected = JSON.parse(await readFile(join(import.meta.dirname, 'fixtures/markdown/sample.expected.json'), 'utf8'));
  assert.deepEqual(parseMarkdown(content, 'markdown'), expected);
});

test('preserves body content verbatim including shell-metacharacters (Review Focus #5)', () => {
  const content = '## x\n\nbody with `backtick` and $(pwd) and ; rm -rf / inline.\n';
  const [t] = parseMarkdown(content, 'markdown');
  assert.equal(t.body, 'body with `backtick` and $(pwd) and ; rm -rf / inline.');
});

test('explicit {#slug} overrides titleSlug via _hint.upstream and deriveImportKey', () => {
  const content = '## Filter list by status {#filter}\n\n- a dropdown.\n';
  const [t] = parseMarkdown(content, 'markdown');
  assert.equal(t._hint.upstream, 'filter');
  assert.equal(t._hint.titleSlug, 'filter-list-by-status');
  assert.equal(t.importKey, 'filter-list-by-status');  // markdown policy is 'never', so upstream is ignored for the key
});
```

Note on the third test: markdown's upstream key policy is `{ trust: 'never' }`, so a `{#filter}` **does not** become the key via the numeric/prefix paths. The way to make it the key is via a separate markdown-only rule: `_hint.upstream` is set to the `{#slug}` value, and `parseMarkdown` runs a special path that uses it directly. Decision: markdown treats `{#slug}` as an **explicit key override** that bypasses `deriveImportKey` entirely; the test above would FAIL as written — update it to `assert.equal(t.importKey, 'filter')`. (Settles OQ #1 explicitly: `{#slug}` is markdown's explicit-id syntax, and it takes precedence.)

- [ ] **Step 2: Correct the third test and run to fail**

Change `assert.equal(t.importKey, 'filter-list-by-status')` to `assert.equal(t.importKey, 'filter')`. Run — `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement**

`normalize.ts`:
- Parse with `unified().use(remarkParse).parse(content)` → mdast tree.
- Walk top-level `heading` nodes at depth 2 (`##`). Depth 1 (`#`) and 3+ (`###`+) do not open a task.
- For each `##` heading: extract plain text title. Look for trailing `{#slug}` and strip it from the title; if present, that slug becomes `_hint.upstream` AND the task's `importKey` directly (markdown's explicit-id rule).
- Collect siblings until the next `##` as the task's content:
  - `###` headings named `Acceptance criteria` (case-insensitive) → `acceptanceCriteria: string[]` from the list items that follow.
  - `###` headings named `Non-goals` / `Non goals` → `nonGoals: string[]`.
  - Everything else → serialise back to markdown string (`toMarkdown`) as `body`.
- When `_hint.upstream` is absent: `importKey = deriveImportKey('markdown', hint, { trust: 'never' }, seenInBatch)` so collisions get `-2`, `-3`.
- When `_hint.upstream` is present (from `{#slug}`): use `slugify(upstream)` directly as `importKey`, add it to `seenInBatch`. If it collides with an earlier explicit slug — reject the whole parse with a readable error (`'duplicate explicit id: filter'`), per OQ #10.

`options.ts`:
```ts
export function resolveInput(input: SourceInput): { content: string; label: string } {
  if (input.content !== undefined) return { content: input.content, label: '<inline>' };
  if (input.path !== undefined) return { content: readFileSync(input.path, 'utf8'), label: input.path };
  throw new Error('markdown source needs content or path');
}
```

Pull `readFileSync` into `provider.ts` instead so `options.ts` stays pure — adjust: `resolveInput` returns `{ content?: string; path?: string }` and `provider.ts` reads the file.

`provider.ts`:
```ts
export class MarkdownTaskSource implements TaskSource {
  readonly id: SourceId = 'markdown';
  readonly capabilities = new Set<SourceCapability>(['pull', 'rich_body', 'acceptance_criteria']);
  async fetch(input: SourceInput): Promise<SourceResult> {
    const { content } = await readInput(input);
    const tasks = parseMarkdown(content, this.id);
    return { tasks, usage: { ...ZERO_SOURCE_USAGE, bytesRead: content.length } };
  }
}
```

- [ ] **Step 4: Run and pass** — 3 tests pass.

- [ ] **Step 5: Write the provider test**

```ts
// packages/adapters/test/markdown-provider.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownTaskSource } from '../src/ticket/markdown/provider.ts';

test('idempotent when re-parsed: same keys, same count', async () => {
  const src = new MarkdownTaskSource();
  const r1 = await src.fetch!({ content: '## A\n\na.\n\n## B\n\nb.' });
  const r2 = await src.fetch!({ content: '## A\n\na EDITED.\n\n## B\n\nb.' });
  assert.deepEqual(r1.tasks.map(t => t.importKey), r2.tasks.map(t => t.importKey));
  assert.equal(r2.tasks[0].body, 'a EDITED.');
});

test('refuses duplicate explicit ids', async () => {
  const src = new MarkdownTaskSource();
  await assert.rejects(
    src.fetch!({ content: '## X {#same}\n\n## Y {#same}\n' }),
    /duplicate explicit id: same/,
  );
});
```

- [ ] **Step 6: Run and pass** — 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/ticket packages/adapters/package.json packages/adapters/test/markdown-*.test.ts packages/adapters/test/fixtures/markdown pnpm-lock.yaml
git commit -m "feat(adapters): markdown TaskSource with acceptance_criteria + non_goals"
```

---

### Task 7: GitHub Issues adapter — options and normalize

**Files:**
- Create: `packages/adapters/src/ticket/github/options.ts`
- Create: `packages/adapters/src/ticket/github/normalize.ts`
- Modify: `packages/adapters/package.json` — add `@octokit/graphql`
- Test: `packages/adapters/test/github-options.test.ts`
- Test: `packages/adapters/test/github-normalize.test.ts`
- Test fixture: `packages/adapters/test/fixtures/github/issues-page1.json`
- Test fixture: `packages/adapters/test/fixtures/github/issues-page1.expected.json`

**Interfaces:**
- Consumes: `SourceInput`, `ParsedTask`, `deriveImportKey` from `@lamproom/core`
- Produces:
  - `buildIssuesQuery(input: SourceInput, target: GithubTarget): { query: string; variables: Record<string, unknown> }` in `options.ts`
  - `normalizeIssueNode(node: GithubIssueNode, sourceId: SourceId, seen: Set<string>): ParsedTask` in `normalize.ts`
  - `extractPageInfo(payload: GithubIssuesPayload): { nextCursor?: string; rateLimit: SourceUsage }` in `normalize.ts`
  - Types: `GithubTarget = { owner: string; repo: string }`, `GithubIssueNode`, `GithubIssuesPayload`

- [ ] **Step 1: Capture a fixture**

Use the GitHub GraphQL Explorer to capture a real `issues` query for a small repo. Sanitise authors' emails. Save as `fixtures/github/issues-page1.json`. The expected shape is one page with 2–3 open issues.

- [ ] **Step 2: Write the failing normalize test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeIssueNode, extractPageInfo } from '../src/ticket/github/normalize.ts';

test('normalizes a GitHub Issue into a ParsedTask with stable key', async () => {
  const payload = JSON.parse(await readFile(join(import.meta.dirname, 'fixtures/github/issues-page1.json'), 'utf8'));
  const seen = new Set<string>();
  const t = normalizeIssueNode(payload.repository.issues.nodes[0], 'github', seen);
  assert.match(t.importKey, /^github-\d+$/);
  assert.equal(typeof t.title, 'string');
  assert.ok(t._hint.upstream?.match(/^\d+$/));
});

test('extractPageInfo returns nextCursor when hasNextPage is true', async () => {
  const payload = JSON.parse(await readFile(join(import.meta.dirname, 'fixtures/github/issues-page1.json'), 'utf8'));
  const info = extractPageInfo(payload);
  if (payload.repository.issues.pageInfo.hasNextPage) {
    assert.equal(info.nextCursor, payload.repository.issues.pageInfo.endCursor);
  } else {
    assert.equal(info.nextCursor, undefined);
  }
  assert.equal(info.rateLimit.requests, 1);
  assert.ok(typeof info.rateLimit.rateLimitRemaining === 'number');
});
```

- [ ] **Step 3: Implement**

`options.ts`:
- `buildIssuesQuery(input, target)` returns the GraphQL document + variables. Honour `input.query` as an issue search filter (e.g. `state:open label:bug`), `input.cursor` as `after`, `input.pageSize` capped at 100, `input.since` as an `updatedAt:>=` fragment appended to the query.

```graphql
query ($owner: String!, $repo: String!, $first: Int!, $after: String, $search: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: $first, after: $after, filterBy: { ... }, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { number title body url createdAt updatedAt labels(first: 20) { nodes { name } } assignees(first: 10) { nodes { login } } }
    }
  }
  rateLimit { remaining resetAt }
}
```

(In practice: switch to the GraphQL `search` connection if `input.query` is set; otherwise the repo issues connection. Pick one path per call.)

`normalize.ts`:
- `normalizeIssueNode(node, sourceId, seen)`:
  - `_hint = { upstream: String(node.number), titleSlug: slugify(node.title) }`
  - `importKey = deriveImportKey(sourceId, _hint, { trust: 'numeric' }, seen)`
  - `title = node.title`, `body = node.body || undefined`
  - `labels = node.labels.nodes.map(n => n.name)`, `assignees = node.assignees.nodes.map(n => n.login)`
  - `extras = { url: node.url, createdAt: node.createdAt, updatedAt: node.updatedAt, number: node.number }`
- `extractPageInfo(payload)`:
  - `nextCursor = payload.repository.issues.pageInfo.hasNextPage ? payload.repository.issues.pageInfo.endCursor : undefined`
  - `rateLimit = { requests: 1, rateLimitRemaining: payload.rateLimit.remaining, rateLimitResetAt: payload.rateLimit.resetAt }`

- [ ] **Step 4: Run and pass** — tests pass. Capture `fixtures/github/issues-page1.expected.json` from the actual normalizer output (freeze it) and add a third test that `deepEqual`s against it.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/ticket/github/{options,normalize}.ts packages/adapters/package.json packages/adapters/test/github-*.test.ts packages/adapters/test/fixtures/github pnpm-lock.yaml
git commit -m "feat(adapters): GitHub Issues options and normalize (pure)"
```

---

### Task 8: GitHub Issues adapter — provider

**Files:**
- Create: `packages/adapters/src/ticket/github/provider.ts`
- Create: `packages/adapters/src/ticket/github/auth.ts`
- Modify: `packages/adapters/src/index.ts`
- Test: `packages/adapters/test/github-provider.test.ts`
- Test: `packages/adapters/test/github-provider-errors.test.ts`

**Interfaces:**
- Consumes: `TaskSource`, `SourceInput`, `SourceResult`, `retryWithBackoff`, `RetryableError`, `DEFAULT_RETRY`, `SourceCredentialResolver` (from `@lamproom/core`)
- Produces: `class GithubTaskSource implements TaskSource` with constructor `({ target: GithubTarget; resolver: SourceCredentialResolver; projectId?: string; graphqlFn?: GraphqlFn; retryPolicy?: RetryPolicy })`
- Produces: `class CredentialMissingError extends Error` in `auth.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GithubTaskSource, CredentialMissingError } from '../src/ticket/github/provider.ts';
import { RetryableError } from '@lamproom/core';

const payloadPath = join(import.meta.dirname, 'fixtures/github/issues-page1.json');

test('throws CredentialMissingError before any network call when credentials are "none" (Review Focus #3)', async () => {
  let graphqlCalls = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'none' }) },
    graphqlFn: async () => { graphqlCalls++; return {}; },
  });
  await assert.rejects(src.fetch!({}), (e: Error) => e instanceof CredentialMissingError);
  assert.equal(graphqlCalls, 0);
});

test('nextCursor is undefined when GraphQL page has hasNextPage false (Review Focus #4)', async () => {
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  payload.repository.issues.pageInfo.hasNextPage = false;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => payload,
  });
  const r = await src.fetch!({});
  assert.equal(r.nextCursor, undefined);
  assert.ok(r.tasks.length > 0);
  assert.equal(r.usage.requests, 1);
});

test('retries on RetryableError and reports summed requests in usage', async () => {
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  let n = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      if (n++ === 0) throw new RetryableError('secondary rate limit', 10);
      return payload;
    },
    retryPolicy: { maxAttempts: 3, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  const r = await src.fetch!({});
  assert.ok(r.tasks.length > 0);
  // One successful request counted; the retried one is implementation choice —
  // record the decision: usage.requests counts network-successful calls only.
  assert.equal(r.usage.requests, 1);
});

test('maps 403 secondary-rate-limit response to RetryableError with Retry-After', async () => {
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      const err = new Error('secondary rate limit');
      (err as any).status = 403;
      (err as any).response = { headers: { 'retry-after': '7' } };
      throw err;
    },
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch!({}), /secondary rate limit/);
});

test('redacts the token from error messages', async () => {
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_SECRETSECRETSECRETSECRETSECRETSECR' }) },
    graphqlFn: async () => { throw new Error('Bad credentials: ghp_SECRETSECRETSECRETSECRETSECRETSECR'); },
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch!({}), (e: Error) => !e.message.includes('ghp_SECRETSECRETSECRETSECRETSECRETSECR'));
});
```

- [ ] **Step 2: Run and fail**

- [ ] **Step 3: Implement**

`auth.ts`:
```ts
export class CredentialMissingError extends Error {
  constructor(public sourceId: string, public projectId: string) {
    super(`no credentials configured for source '${sourceId}' and project '${projectId}'`);
  }
}

export function redactToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join('[redacted]');
}
```

`provider.ts`:
- Constructor takes dependencies; `graphqlFn` is injectable so tests use a stub without `@octokit/graphql`.
- Default `graphqlFn` is built lazily from `@octokit/graphql` with `headers: { authorization: 'bearer <token>' }` using the resolved credential.
- `fetch(input)`:
  1. Resolve credential. If `{ kind: 'none' }`, throw `CredentialMissingError`.
  2. If `graphqlFn` was not injected, construct it now with the token.
  3. Build query+variables via `buildIssuesQuery`.
  4. Wrap the call in `retryWithBackoff` with `this.retryPolicy ?? DEFAULT_RETRY`. Map Octokit `{status: 403, headers: {'retry-after'}}` or `{status: 429}` to `RetryableError(message, retryAfterMs)`.
  5. Normalize nodes, call `extractPageInfo`, assemble `SourceResult`.
  6. Catch any error and run it through `redactToken` before re-throwing.
- `id = 'github'`.
- `capabilities = new Set(['pull', 'pagination', 'incremental', 'labels', 'assignees', 'stable_upstream_key'])`.
- `ingest` not implemented (webhook adapter is a later plan).

- [ ] **Step 4: Run and pass** — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/ticket/github/{provider,auth}.ts packages/adapters/src/index.ts packages/adapters/test/github-provider*.test.ts
git commit -m "feat(adapters): GithubTaskSource with PAT auth, retry and pagination"
```

---

### Task 9: Live tests, docs and vault updates

**Files:**
- Create: `packages/adapters/test/github-live.test.ts`
- Create: `packages/adapters/test/markdown-live.test.ts` (round-trip against the backlog-importer skill's own sample if it has one, otherwise a fixture)
- Modify: `package.json` — add github + markdown lanes to `test:live`
- Create: `README.task-sources.md` — one-page operator guide (how to put a PAT in `.lamproom/credentials.json`, how to run a fetch from the CLI, what rate-limit headers to watch)
- Modify: `docs/Lamproom/Intake And Import/TaskSource Port.md` — port decisions row, implementation status
- Modify: `docs/Lamproom/Intake And Import/Markdown Task Source.md` — point at the new package path
- Modify: `docs/Lamproom/Intake And Import/Future Task Sources.md` — mark GitHub as shipped, note the webhook deferral
- Modify: `docs/Lamproom/Intake And Import/Intake And Import Open Questions.md` — mark #1, #2, #22, part of #4, part of #25 as **Resolved** with a link back to this plan

- [ ] **Step 1: Write the live tests**

```ts
// packages/adapters/test/github-live.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubTaskSource } from '../src/ticket/github/provider.ts';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';

const live = process.env.FLOWBOARD_LIVE === '1' && process.env.FLOWBOARD_LIVE_GITHUB_REPO;

test('live GitHub fetch returns real issues', { skip: !live }, async () => {
  const [owner, repo] = process.env.FLOWBOARD_LIVE_GITHUB_REPO!.split('/');
  const src = new GithubTaskSource({
    target: { owner, repo },
    resolver: new EnvFileCredentialResolver({ root: process.cwd() }),
    projectId: 'live',
  });
  const r = await src.fetch!({ pageSize: 5 });
  assert.ok(Array.isArray(r.tasks));
  assert.ok(r.usage.requests >= 1);
  assert.ok(typeof r.usage.rateLimitRemaining === 'number' && r.usage.rateLimitRemaining > 0);
});
```

- [ ] **Step 2: Add the lane**

```json
"test:live": "FLOWBOARD_LIVE=1 node --test packages/adapters/test/claude-live.test.ts packages/adapters/test/opencode-live.test.ts packages/adapters/test/github-live.test.ts packages/adapters/test/markdown-live.test.ts packages/cli/test/cli-live.test.ts packages/cli/test/ask-live.test.ts"
```

- [ ] **Step 3: Run once against a real repo**

```bash
echo '{"github":{"kind":"github_pat","token":"ghp_xxx"}}' > .lamproom/credentials.json && chmod 600 .lamproom/credentials.json
FLOWBOARD_LIVE_GITHUB_REPO=octokit/octokit.js pnpm test:live
```

Record the issue count returned and the `rateLimitRemaining` in the commit message.

- [ ] **Step 4: Write the operator guide**

`README.task-sources.md` covers: where to put the credentials file, what fields a markdown backlog supports (`##` headings, `### Acceptance criteria`, `### Non-goals`, `{#slug}`), what the GitHub PAT needs (`read:issues`), how to invoke the adapter from `run-flow`, and what to do when GitHub returns a secondary rate limit.

- [ ] **Step 5: Update the vault**

In each file above, add a `**2026-11-14 update:**` block near the top citing this plan's branch/commit and the decisions table. Mark the resolved OQs with `**Resolved 2026-11-14 — see plan.**` on the row and remove them from the "unresolved" index.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/adapters/test/github-live.test.ts packages/adapters/test/markdown-live.test.ts README.task-sources.md docs/Lamproom/Intake\ And\ Import/
git commit -m "docs(task-source): live tests, operator guide, vault decisions recorded"
```

---

## When done

- [ ] `pnpm test:packages` — every new test passes, no regressions.
- [ ] `pnpm typecheck:packages` — clean.
- [ ] `pnpm test:live` with `FLOWBOARD_LIVE=1` + a real PAT — GitHub lane passes; cost in `usage.requests` is plausible.
- [ ] `grep -r 'TaskSource\|ParsedTask' ` shows the port is referenced only by the five expected places (core index, two adapter folders, the credentials resolver, settings.tsx comment) — no accidental copies.
- [ ] `grep -r 'process.env.GITHUB_TOKEN' packages/adapters/` returns nothing (confirms the no-env-at-call-time rule).
- [ ] Open a PR against `dev`. PR description quotes the five Review Focus cases and links the spec.

## What this plan does **not** finish

Named here so follow-up plans can start:

1. **Intake API** — `POST /api/import/backlog`, the `import_backlog` job, upsert on `(project_id, source_id, import_key)`. Needs the DB plan to land first; neither exists in `app/api/` today.
2. **Backlog importer agent sandboxed** — wires the SKILL at `internal/backlog-importer/` to the port as the second "messy file" adapter path. Needs a decision on cost tagging (OQ #12).
3. **Webhook ingest** — the `ingest()` method is on the port; nothing implements it yet. Needs `verify.ts` per source plus an HTTP route.
4. **OAuth** — a separate `SourceCredentials` variant and resolver path per source. One plan per source.
5. **Jira** — ADF→markdown converter, JQL support, cloudId lookup, Jira Cloud + Server variants.
6. **Linear** — Linear SDK, GraphQL filter DSL, their stable-key format.
7. **UI** — the board Import button, `/intake` progress view, the settings page for credentials and source registration.
