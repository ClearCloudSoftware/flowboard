import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Workspaces } from './workspaces.tsx';
import '../flows/flows.css';
import './workspaces.css';

export const metadata: Metadata = { title: 'Workspaces · FlowBoard' };

/** `flowboard/workspaces?folder=`: every task worktree in a repo. Everything on it loads in the browser, from /api/workspaces. */
export default function WorkspacesPage() {
  return (
    <Suspense>
      <Workspaces />
    </Suspense>
  );
}
