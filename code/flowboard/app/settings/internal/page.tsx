import type { Metadata } from 'next';
import { InternalPage } from '../internal.tsx';

export const metadata: Metadata = { title: 'Internal steps · Settings · FlowBoard' };

/** `/settings/internal`: the steps FlowBoard runs for itself, the repo analyst and the backlog importer. */
export default function Page() {
  return <InternalPage />;
}
