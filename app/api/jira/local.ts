/**
 * Shared helpers for the /api/jira/* routes.
 *
 * `pendingStates` is a module-scope Map that holds OAuth PKCE state between
 * /auth/start and /auth/callback. Entries expire after 10 minutes. Stored in
 * memory only; a server restart invalidates any in-flight sign-in attempt,
 * which is the right trade-off for a local-first app.
 */

export interface PendingState {
  codeVerifier: string;
  createdAt: number;
}

export const pendingStates = new Map<string, PendingState>();

const TEN_MINUTES_MS = 10 * 60 * 1000;

/** Drop stale entries. Called at the top of /auth/start and /auth/callback. */
export function sweepStates(now = Date.now()): void {
  for (const [state, entry] of pendingStates) {
    if (now - entry.createdAt > TEN_MINUTES_MS) pendingStates.delete(state);
  }
}

/**
 * Running intake imports, keyed by `${projectId}:${sourceId}`. Used by
 * /api/import/jira to dedup concurrent starts and let the UI poll progress
 * from the DB alongside. Promises are kept so a hot reload doesn't orphan
 * the work; lifetime ties to the Next.js worker's module scope.
 */
export const runningImports = new Map<string, { importId: string; promise: Promise<unknown> }>();
export const runningKey = (projectId: string, sourceId: string) => `${projectId}:${sourceId}`;
