import type { Metadata } from 'next';
import { WorkflowsPage } from '../workflows.tsx';

export const metadata: Metadata = { title: 'Workflows · Settings · Lamproom' };

/** `/settings/workflows`: the flows Lamproom ships, by domain. */
export default function Page() {
  return <WorkflowsPage />;
}
