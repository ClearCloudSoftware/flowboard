'use client';
/**
 * Jira connection + preview.
 *
 * Two tabs: "Sign in with Atlassian" (OAuth) and "API token" (Basic auth).
 * Preview panel is always visible; disabled until credentials are stored.
 *
 * Every value is server-driven. No tokens ever live in client state — only
 * JiraStatus (which never includes a token) and the preview results.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/loader';
import type { JiraStatus } from '../../../../../packages/cli/src/jira.ts';
import { ErrorLine, Field, Head } from '../../../settings.tsx';

interface ParsedTaskRow {
  importKey: string;
  title: string;
  labels?: string[];
  assignees?: string[];
  extras?: Record<string, unknown>;
}

const statusQuery = {
  queryKey: ['jira', 'status'] as const,
  queryFn: async (): Promise<JiraStatus> => {
    const r = await fetch('/api/jira/auth/status');
    if (!r.ok) throw new Error(`status ${r.status}`);
    return (await r.json()) as JiraStatus;
  },
};

async function startOAuth(): Promise<{ authUrl: string }> {
  const r = await fetch('/api/jira/auth/start', { method: 'POST' });
  if (!r.ok) throw new Error(`start failed: ${r.status}`);
  return (await r.json()) as { authUrl: string };
}

async function saveApiToken(input: {
  baseUrl: string;
  email: string;
  token: string;
  defaultJql?: string;
}): Promise<JiraStatus> {
  const r = await fetch('/api/jira/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const { error } = (await r.json()) as { error?: string };
    throw new Error(error ?? `save failed: ${r.status}`);
  }
  return (await r.json()) as JiraStatus;
}

async function signOut(): Promise<void> {
  const r = await fetch('/api/jira/auth', { method: 'DELETE' });
  if (!r.ok) throw new Error(`sign-out failed: ${r.status}`);
}

async function preview(jql: string): Promise<{ tasks: ParsedTaskRow[]; nextCursor?: string }> {
  const url = new URL('/api/jira/preview', window.location.origin);
  if (jql.trim() !== '') url.searchParams.set('jql', jql.trim());
  url.searchParams.set('limit', '10');
  const r = await fetch(url);
  if (!r.ok) {
    const { error } = (await r.json()) as { error?: string };
    throw new Error(error ?? `preview failed: ${r.status}`);
  }
  return (await r.json()) as { tasks: ParsedTaskRow[]; nextCursor?: string };
}

const warnBox =
  'm-0 flex items-start gap-2 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 font-sans text-xs text-wait';
const okBox =
  'm-0 flex items-start gap-2 border-l-[3px] border-run bg-[var(--run-soft)] px-2.5 py-1.5 font-sans text-xs text-run';

function AuthStatusBanner({ status }: { status: JiraStatus }) {
  // Read ?auth=... once on mount instead of via useSearchParams, which forces
  // dynamic rendering of the whole route in Next.js 15+ and triggers a
  // Turbopack hot-reload loop in dev.
  const [auth, setAuth] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAuth(new URLSearchParams(window.location.search).get('auth'));
  }, []);
  if (status.connected) {
    if (status.kind === 'atlassian_oauth')
      return (
        <p className={okBox}>
          Signed in via OAuth · site <code className="font-mono">{status.siteName}</code>
          {status.expiresAt !== undefined && <> · token expires {new Date(status.expiresAt).toLocaleString()}</>}
        </p>
      );
    return (
      <p className={okBox}>
        API token saved · <code className="font-mono">{status.email}</code> @ <code className="font-mono">{status.baseUrl}</code>
      </p>
    );
  }
  if (auth === 'state') return <p className={warnBox}>OAuth was refused: state did not match. Try again.</p>;
  if (auth === 'exchange') return <p className={warnBox}>OAuth was refused: Atlassian would not exchange the code.</p>;
  if (auth === 'no_sites') return <p className={warnBox}>Signed in, but your account has no Jira sites.</p>;
  if (auth === 'missing') return <p className={warnBox}>Sign-in was cancelled.</p>;
  return <p className="m-0 font-sans text-xs text-[var(--ink-2)]">Not connected. Pick a path below.</p>;
}

function OAuthTab({ status }: { status: JiraStatus }) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: startOAuth,
    onSuccess: ({ authUrl }) => {
      window.open(authUrl, '_blank', 'noopener,noreferrer');
    },
  });
  const out = useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jira', 'status'] }),
  });
  if (status.connected && status.kind === 'atlassian_oauth') {
    return (
      <div className="grid gap-2">
        <Button size="sm" variant="outline" disabled={out.isPending} onClick={() => out.mutate()}>
          {out.isPending ? 'Signing out…' : 'Sign out'}
        </Button>
        <ErrorLine error={out.error} />
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Button size="sm" disabled={start.isPending} onClick={() => start.mutate()}>
        {start.isPending ? 'Opening Atlassian…' : 'Sign in with Atlassian'}
      </Button>
      <p className="m-0 font-sans text-xs text-[var(--ink-2)]">
        Opens Atlassian in a new tab. Approve, then return here — Lamproom stores the refresh token and renews itself before
        expiry.
      </p>
      <ErrorLine error={start.error} />
    </div>
  );
}

function ApiTokenTab({ status }: { status: JiraStatus }) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? '');
  const [email, setEmail] = useState(status.email ?? '');
  const [token, setToken] = useState('');
  const [defaultJql, setDefaultJql] = useState(status.defaultJql ?? '');
  const save = useMutation({
    mutationFn: () => saveApiToken({ baseUrl: baseUrl.trim(), email: email.trim(), token: token.trim(), defaultJql: defaultJql.trim() || undefined }),
    onSuccess: () => {
      setToken('');
      queryClient.invalidateQueries({ queryKey: ['jira', 'status'] });
    },
  });
  const dirty = baseUrl.trim() !== '' && email.trim() !== '' && token.trim() !== '';
  const connectedAsApiToken = status.connected && status.kind === 'atlassian_api_token';
  return (
    <div className="grid gap-3">
      <Field title="Atlassian base URL" htmlFor="jira-url" text="Your Atlassian site: https://xxxxx.atlassian.net">
        <Input id="jira-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://acme.atlassian.net" className="max-w-md font-mono" />
      </Field>
      <Field title="Email" htmlFor="jira-email" text="The email on your Atlassian account.">
        <Input id="jira-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@acme.com" className="max-w-md" />
      </Field>
      <Field title="API token" htmlFor="jira-token" text={<>Create a fresh token at <code className="font-mono">id.atlassian.com/manage-profile/security/api-tokens</code>. Lamproom stores it on this machine; never commit it.</>}>
        <Input id="jira-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={connectedAsApiToken ? '(saved · enter a new one to replace)' : 'ATATT...'} className="max-w-md font-mono" />
      </Field>
      <Field title="Default JQL" htmlFor="jira-jql" text="The query the preview runs. Optional; you can also pass one in the preview form.">
        <Input id="jira-jql" value={defaultJql} onChange={(e) => setDefaultJql(e.target.value)} placeholder="project = KAN AND statusCategory != Done ORDER BY updated DESC" className="w-full font-mono" />
      </Field>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : connectedAsApiToken ? 'Replace' : 'Save'}
        </Button>
      </div>
      <ErrorLine error={save.error} />
    </div>
  );
}

function PreviewPanel({ status }: { status: JiraStatus }) {
  const [jql, setJql] = useState(status.defaultJql ?? '');
  const run = useMutation({ mutationFn: () => preview(jql) });
  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <Head title="Preview">
        Fetch the first 10 issues that match the JQL. Nothing persists — this is purely a check that the connection works.
      </Head>
      <div className="flex items-center gap-2">
        <Input value={jql} onChange={(e) => setJql(e.target.value)} placeholder="project = KAN ORDER BY updated DESC" className="flex-1 font-mono" disabled={!status.connected} />
        <Button size="sm" disabled={!status.connected || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Fetching…' : 'Preview'}
        </Button>
      </div>
      {!status.connected && <p className={warnBox}>Connect first — pick OAuth or API token above.</p>}
      <ErrorLine error={run.error} />
      {run.data && (
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1 pr-3 font-normal text-[var(--ink-2)]">Key</th>
              <th className="py-1 pr-3 font-normal text-[var(--ink-2)]">Title</th>
              <th className="py-1 pr-3 font-normal text-[var(--ink-2)]">Status</th>
              <th className="py-1 pr-3 font-normal text-[var(--ink-2)]">Labels</th>
              <th className="py-1 font-normal text-[var(--ink-2)]">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {run.data.tasks.map((t) => (
              <tr key={t.importKey} className="border-b border-border/50">
                <td className="py-1 pr-3">{String(t.extras?.['issueKey'] ?? t.importKey)}</td>
                <td className="py-1 pr-3 font-sans">{t.title}</td>
                <td className="py-1 pr-3">{String(t.extras?.['statusName'] ?? '')}</td>
                <td className="py-1 pr-3">{(t.labels ?? []).join(', ')}</td>
                <td className="py-1">{(t.assignees ?? []).length > 0 ? '•' : ''}</td>
              </tr>
            ))}
            {run.data.tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-[var(--ink-2)]">
                  No issues matched.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {run.data?.nextCursor !== undefined && (
        <p className="m-0 font-sans text-xs text-[var(--ink-2)]">More pages available; preview shows the first 10 only.</p>
      )}
    </section>
  );
}

export function JiraPage() {
  const [tab, setTab] = useState<'oauth' | 'api_token'>('oauth');
  const status = useQuery(statusQuery);
  if (status.isPending) return <Loader />;
  if (status.isError) return <p role="alert" className="m-0 text-fail">{status.error.message}</p>;
  const s = status.data;
  return (
    <>
      <Head title="Jira">
        Pull issues from your Atlassian Cloud site into Lamproom. Read-only in this version; writes land in a follow-up.
      </Head>
      <AuthStatusBanner status={s} />
      <div className="grid gap-4">
        <div role="tablist" className="flex items-center gap-1 border-b border-border">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'oauth'}
            className={`border-b-2 px-3 py-1.5 font-sans text-xs ${tab === 'oauth' ? 'border-ink' : 'border-transparent text-[var(--ink-2)]'}`}
            onClick={() => setTab('oauth')}
          >
            Sign in with Atlassian
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'api_token'}
            className={`border-b-2 px-3 py-1.5 font-sans text-xs ${tab === 'api_token' ? 'border-ink' : 'border-transparent text-[var(--ink-2)]'}`}
            onClick={() => setTab('api_token')}
          >
            API token
          </button>
        </div>
        {tab === 'oauth' ? <OAuthTab status={s} /> : <ApiTokenTab status={s} />}
      </div>
      <PreviewPanel status={s} />
    </>
  );
}
