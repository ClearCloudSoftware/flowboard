/**
 * Runs once as the Next server starts: the knowledge assets' scheduler, which rebuilds a project's maps when its base
 * branch moves or once a day (`knowledge-run.ts`). Node only; not while `next build` prerenders.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startScheduler } = await import('./packages/cli/src/knowledge-run.ts');
  const { dataDir, runsDir } = await import('./app/api/flows/local.ts');
  startScheduler(dataDir(), runsDir());
}
