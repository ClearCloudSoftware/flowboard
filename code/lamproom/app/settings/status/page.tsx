import type { Metadata } from 'next';
import { StatusPage } from '../status.tsx';

export const metadata: Metadata = { title: 'System status · Settings · Lamproom' };

/** `/settings/status`: whether this machine can run your projects now, the doctor's checks run in the app. */
export default function Page() {
  return <StatusPage />;
}
