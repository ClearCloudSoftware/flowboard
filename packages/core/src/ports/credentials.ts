/**
 * Credentials — the port that supplies per-source auth to adapters.
 *
 * Adapters NEVER read `process.env` at call time. They receive a resolver at
 * construction and ask it per fetch. This keeps the worker's own credentials
 * (an engineer's GITHUB_TOKEN, say) from silently billing against the wrong
 * tenant; it also makes OAuth refresh an adapter concern, not a global.
 *
 * The v1 union carries only `none` and `github_pat`. OAuth variants land in
 * their own plans — one per source that needs them. The union stays open
 * (new `kind`s are additive; the resolver contract does not change).
 *
 * The first resolver adapter is `EnvFileCredentialResolver` under
 * `adapters/src/credentials/env-file-resolver.ts`. It reads
 * `.flowboard/credentials.json` with POSIX mode `0600` enforced.
 *
 * See docs/superpowers/specs/2026-11-14-task-source-port-design.md, section
 * "Credentials".
 */

import type { SourceId } from './task-source.ts';

/**
 * A credential for one source. The adapter inspects `kind` to decide how to
 * use it; passing a credential to an adapter that does not understand its
 * `kind` is a programming error (throw).
 *
 * `none` is the explicit "no credential configured" state — distinct from
 * absent. Adapters whose source always needs auth (github, jira, linear)
 * throw a `CredentialMissingError` at the top of `fetch()` when they see
 * `none`, BEFORE any network call.
 */
export type SourceCredentials =
  | { readonly kind: 'none' }
  | { readonly kind: 'github_pat'; readonly token: string };

/**
 * Resolve credentials for a given source and project.
 *
 * `projectId` lets a resolver scope credentials per project in the future.
 * The v1 EnvFileCredentialResolver ignores it (single shared credentials
 * file per installation). A per-project variant can land without changing
 * this interface.
 *
 * The resolver MUST NOT throw on "no credential configured" — it returns
 * `{ kind: 'none' }`. It MAY throw on a corrupt or unreadable credential
 * store (e.g. file exists but has broader-than-0600 permissions, JSON parse
 * error). Adapters then surface that as a setup error, not an auth error.
 */
export interface SourceCredentialResolver {
  resolve(sourceId: SourceId, projectId: string): Promise<SourceCredentials>;
}
