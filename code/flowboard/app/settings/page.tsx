import type { Metadata } from 'next';
import { AppSettingsPage } from './settings.tsx';

export const metadata: Metadata = { title: 'Settings · FlowBoard' };

/** `/settings`: the app's own settings, which every project inherits. Loaded in the browser, from /api/settings. */
export default function Page() {
  return <AppSettingsPage />;
}
