import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectPage } from '../../projects/project.tsx';

export const metadata: Metadata = { title: 'Project · FlowBoard' };

/** `/p/<slug>`: one project. The slug is read in the browser, so the page waits for it in a Suspense boundary. */
export default function Page() {
  return (
    <Suspense>
      <ProjectPage />
    </Suspense>
  );
}
