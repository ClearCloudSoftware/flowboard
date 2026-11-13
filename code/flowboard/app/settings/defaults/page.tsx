import type { Metadata } from 'next';
import { DefaultsPage } from '../settings.tsx';

export const metadata: Metadata = { title: 'Defaults · Settings · FlowBoard' };

/** `/settings/defaults`: what every project inherits until its type or the project itself sets otherwise. */
export default function Page() {
  return <DefaultsPage />;
}
