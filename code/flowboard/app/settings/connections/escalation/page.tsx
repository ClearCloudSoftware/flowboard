import type { Metadata } from 'next';
import { EscalationChannelsPage } from '../../settings.tsx';

export const metadata: Metadata = { title: 'Escalation channels · Settings · FlowBoard' };

/** `/settings/connections/escalation`: where a question that waited too long reaches you. */
export default function Page() {
  return <EscalationChannelsPage />;
}
