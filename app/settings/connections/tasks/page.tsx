import type { Metadata } from 'next';
import { TaskProvidersPage } from '../../settings.tsx';

export const metadata: Metadata = { title: 'Task providers · Settings · Lamproom' };

/** `/settings/connections/tasks`: where tasks come from. */
export default function Page() {
  return <TaskProvidersPage />;
}
