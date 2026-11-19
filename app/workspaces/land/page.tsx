import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Land } from './land.tsx';
import '../../flows/flows.css';
import '../workspaces.css';

export const metadata: Metadata = { title: 'Land a task · Lamproom' };

/** `lamproom/workspaces/land?folder=&id=`: review a task branch, land it in the base, clean up. */
export default function LandPage() {
  return (
    <Suspense>
      <Land />
    </Suspense>
  );
}
