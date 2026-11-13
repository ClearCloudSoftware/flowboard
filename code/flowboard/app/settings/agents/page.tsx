import type { Metadata } from 'next';
import { AgentsPage } from '../agents.tsx';

export const metadata: Metadata = { title: 'Agents · Settings · FlowBoard' };

/** `/settings/agents`: the agent CLIs FlowBoard drives, Claude Code and OpenCode. */
export default function Page() {
  return <AgentsPage />;
}
