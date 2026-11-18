import type { Metadata } from 'next';
import { JiraPage } from './JiraPage';

export const metadata: Metadata = { title: 'Jira · Task providers · Settings · Lamproom' };

/**
 * Opt out of Next.js 16's cacheComponents + partialPrefetching for this route.
 * The Jira page carries only client-side state (TanStack Query against
 * /api/jira/* routes), so prefetching + cache-component reconciliation cause
 * an HMR reload loop in dev. The page is already fast; no cache win here.
 */
export const dynamic = 'force-dynamic';

/** `/settings/connections/tasks/jira`: sign in with Atlassian OAuth or save an API token, preview the backlog. */
export default function Page() {
  return <JiraPage />;
}
