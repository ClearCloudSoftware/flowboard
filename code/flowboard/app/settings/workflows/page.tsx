import type { Metadata } from 'next';
import { WorkflowsPage } from '../workflows.tsx';

export const metadata: Metadata = { title: 'Workflows · Settings · FlowBoard' };

/** `/settings/workflows`: the flows FlowBoard ships, by domain. */
export default function Page() {
  return <WorkflowsPage />;
}
