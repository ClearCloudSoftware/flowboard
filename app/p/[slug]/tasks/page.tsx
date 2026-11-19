import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TasksBoard } from '../../../projects/tasks-board.tsx';

export const metadata: Metadata = { title: 'Tasks · Lamproom' };

/** `/p/<slug>/tasks`: the kanban board for one project. Slug is read in the browser. */
export default function Page() {
  return (
    <Suspense>
      <TasksBoard />
    </Suspense>
  );
}
