import type { Metadata } from 'next';
import { RepositoriesPage } from '../../settings.tsx';

export const metadata: Metadata = { title: 'Source repositories · Settings · FlowBoard' };

/** `/settings/connections/repositories`: where projects are cloned from. */
export default function Page() {
  return <RepositoriesPage />;
}
