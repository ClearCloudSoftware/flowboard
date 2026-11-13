'use client';
/** What the installed `gh` login means for FlowBoard, and the command that fixes it when it can't be used. */
import type { GhStatus } from '../projects/api.ts';

const Cmd = ({ children }: { children: string }) => <code className="bg-secondary px-1 py-px">{children}</code>;

/** How to get `gh` to a usable login, in a sentence; nothing when it is connected. */
export function GhFix({ status }: { status: GhStatus }) {
  if (status.state === 'missing')
    return (
      <>
        FlowBoard reaches GitHub through the GitHub CLI, and it is not installed. Install it (<Cmd>brew install gh</Cmd>), then run <Cmd>gh auth login</Cmd> in a terminal.
      </>
    );
  if (status.state === 'signed-out')
    return (
      <>
        The GitHub CLI is not logged in. Run <Cmd>gh auth login</Cmd> in a terminal, then check again.
      </>
    );
  if (status.state === 'error')
    return (
      <>
        The GitHub CLI can&apos;t say who is logged in: {status.message}. Once that is fixed, check again.
      </>
    );
  if (status.state === 'rejected')
    return (
      <>
        GitHub no longer accepts the GitHub CLI&apos;s token for <b>{status.login}</b> ({status.message}). Run <Cmd>gh auth refresh -h github.com</Cmd> to sign in again, or{' '}
        <Cmd>gh auth login</Cmd> for another account, then check again.
      </>
    );
  return null;
}
