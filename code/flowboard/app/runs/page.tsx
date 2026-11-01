import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Runs } from './runs.tsx';
import '../flows/flows.css';

export const metadata: Metadata = { title: 'Runs · FlowBoard' };

/** `flowboard/runs`: run-flow's runs and their logs. Everything on it loads in the browser, from /api/runs. */
export default function RunsPage() {
  return (
    <Suspense>
      <Runs />
    </Suspense>
  );
}
