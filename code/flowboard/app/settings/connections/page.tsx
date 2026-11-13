import type { Metadata } from 'next';
import { ConnectionsPage } from '../settings.tsx';

export const metadata: Metadata = { title: 'Connections · Settings · FlowBoard' };

/** `/settings/connections`: the services FlowBoard reaches, through the logins this machine already has. */
export default function Page() {
  return <ConnectionsPage />;
}
