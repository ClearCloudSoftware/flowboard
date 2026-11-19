import type { Metadata } from 'next';
import { GeneralPage } from './settings.tsx';

export const metadata: Metadata = { title: 'General · Settings · Lamproom' };

/** `/settings`: General, Lamproom's own settings. Loaded in the browser, from /api/settings. */
export default function Page() {
  return <GeneralPage />;
}
