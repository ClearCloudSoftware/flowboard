import type { Metadata } from 'next';
import { JiraPage } from './JiraPage';

export const metadata: Metadata = { title: 'Jira · Task providers · Settings · Lamproom' };

/** `/settings/connections/tasks/jira`: sign in with Atlassian OAuth or save an API token, preview the backlog. */
export default function Page() {
  return <JiraPage />;
}
