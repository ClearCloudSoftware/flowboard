import type { ReactNode } from 'react';
import { Topbar } from '../projects/topbar.tsx';
import { SettingsNav } from './nav.tsx';

/** `/settings/*`: the app's own settings, a section per page beside a sidebar listing them, as GitHub's settings do. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-[13px]">
      <Topbar here="settings" />
      <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-4 px-4 py-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div>
            <h1 className="m-0 font-sans text-lg font-semibold">Settings</h1>
            <p className="m-0 font-sans text-xs text-muted-foreground">FlowBoard on this machine</p>
          </div>
          <SettingsNav />
        </div>
        <main className="grid min-w-0 content-start gap-6">{children}</main>
      </div>
    </div>
  );
}
