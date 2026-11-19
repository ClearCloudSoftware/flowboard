import type { Metadata } from 'next';
import { AgentsPage } from '../agents.tsx';

export const metadata: Metadata = { title: 'Agents · Settings · Lamproom' };

/** `/settings/agents`: the agent CLIs Lamproom drives, Claude Code and OpenCode. */
export default function Page() {
  return <AgentsPage />;
}
