'use client';
/**
 * Connections → Escalation channels: Slack, the one channel built (its two tokens, a test, the socket's state, the
 * channels it refused, and the address its links point at); the others are coming soon. Loads /api/slack.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail, MessageSquare, TriangleAlert, Webhook } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ADDRESS, ADDRESS_RE } from '../../packages/cli/src/settings.ts';
import { removeSlackTokens, saveSlackTokens, type SlackView, slackQuery, testSlackTokens, updateAppSettings } from '../projects/api.ts';
import { ErrorLine, Head, icon, Row, Soon, ul } from './settings.tsx';

const warn = 'm-0 flex items-start gap-2 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 font-sans text-xs text-wait';
const small = 'text-[11px] text-muted-foreground';
const MANIFEST = 'docs/FlowBoard/Projects/Slack Escalation Handoff.md';

function Status({ v }: { v: SlackView }) {
  const s = v.socket;
  const [dot, text] =
    s.state === 'connected'
      ? ['bg-run', `Connected to ${s.team}`]
      : s.state === 'connecting'
        ? ['bg-wait', 'Connecting…']
        : s.state === 'error'
          ? ['bg-fail', `Not connected: ${s.error}`]
          : ['bg-[var(--done)]', v.bot && v.app ? 'Not connected yet' : `Not connected: ${v.bot ? 'paste the app-level token too' : v.app ? 'paste the bot token too' : 'paste both tokens'}`];
  return (
    <p className="m-0 font-sans text-[13px]">
      <span className={`mr-1.5 inline-block size-[7px] align-middle ${dot}`} aria-hidden />
      {text}
    </p>
  );
}

function Token({ id, label, set, value, onChange, placeholder }: { id: string; label: string; set: boolean; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label htmlFor={id} className="grid gap-1">
      <span className={small}>
        {label} · <b className={set ? 'font-medium text-run' : 'font-medium'}>{set ? 'set' : 'not set'}</b>
      </span>
      <Input id={id} type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder={set ? 'a new one, to replace it' : placeholder} autoComplete="off" spellCheck={false} className="h-8 w-72 font-mono text-[13px]" />
    </label>
  );
}

function Address({ v }: { v: SlackView }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState(v.address);
  const save = useMutation({ mutationFn: () => updateAppSettings({ address: address.trim() }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slack'] }) });
  const bad = !ADDRESS_RE.test(address.trim());
  return (
    <div className="grid gap-1 border-t border-border pt-2">
      <label htmlFor="fb-address" className="font-sans text-xs font-semibold">
        FlowBoard address
      </label>
      <span className={small}>Where Slack&rsquo;s Open in FlowBoard links point: this machine&rsquo;s address as your browser reaches it.</span>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="fb-address" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} aria-invalid={bad || undefined} className="h-8 w-72 font-mono text-[13px]" />
        <Button size="sm" variant="outline" disabled={bad || address.trim() === v.address || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {bad && <em className="text-[11px] text-fail not-italic">{ADDRESS}</em>}
      <ErrorLine error={save.error} />
    </div>
  );
}

function Slack() {
  const queryClient = useQueryClient();
  const view = useQuery(slackQuery);
  const [bot, setBot] = useState('');
  const [app, setApp] = useState('');
  const done = (v: SlackView) => queryClient.setQueryData(['slack'], v);
  const test = useMutation({ mutationFn: testSlackTokens });
  const save = useMutation({ mutationFn: () => saveSlackTokens({ ...(bot.trim() && { bot }), ...(app.trim() && { app }) }), onSuccess: (v) => (setBot(''), setApp(''), test.reset(), done(v)) });
  const remove = useMutation({ mutationFn: removeSlackTokens, onSuccess: (v) => (test.reset(), done(v)) });
  const v = view.data;
  return (
    <Row icon={icon(MessageSquare)} name="Slack" text="A question nobody answered in FlowBoard is posted to the channel a project's escalation names, after its wait, and can be answered there; the first answer, here or there, wins. A project's budget alert and cap are posted too.">
      {!v ? (
        view.isError ? <ErrorLine error={view.error} /> : <p className="m-0 text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-2 font-sans text-[13px]">
          <Status v={v} />
          {v.problems.map((p) => (
            <p key={p} className={warn}>
              <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              {p}
            </p>
          ))}
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-wrap items-end gap-3">
              <Token id="slack-bot" label="Bot token" set={v.bot} value={bot} onChange={setBot} placeholder="xoxb-…" />
              <Token id="slack-app" label="App-level token" set={v.app} value={app} onChange={setApp} placeholder="xapp-…" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" type="submit" disabled={(!bot.trim() && !app.trim()) || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {v.bot && (
                <Button size="sm" type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending ? 'Testing…' : 'Test'}
                </Button>
              )}
              {(v.bot || v.app) && (
                <Button size="sm" type="button" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  Remove
                </Button>
              )}
            </div>
          </form>
          <ErrorLine error={save.error ?? remove.error ?? test.error} />
          {test.data && (test.data.ok ? <p className="m-0 text-xs">Workspace <b>{test.data.team}</b> · bot <b>{test.data.bot}</b></p> : <p className={warn}>{test.data.error}</p>)}
          <p className={`m-0 ${small}`}>
            Saved in <code>secrets.json</code> in FlowBoard&rsquo;s data folder, apart from its settings; no page reads them back. Make the Slack app from the manifest in <code>{MANIFEST}</code>: Socket Mode, so Slack needs no address of this machine.
          </p>
          <Address key={v.address} v={v} />
        </div>
      )}
    </Row>
  );
}

// Escalation And Notifications' Notifier adapters: Slack is built, the rest later (Notification Channels).
const SOON = [
  { id: 'discord', name: 'Discord', text: 'The same, in a Discord channel, answered in place.', icon: MessageSquare },
  { id: 'google-chat', name: 'Google Chat', text: 'The same, in a Google Chat space, answered in place.', icon: MessageSquare },
  { id: 'email', name: 'Email', text: 'A link to the question in the inbox; the answer is given in FlowBoard.', icon: Mail },
  { id: 'webhook', name: 'Webhook', text: 'The question posted as JSON to a URL, with a link back to the inbox.', icon: Webhook },
  { id: 'desktop', name: 'Desktop', text: 'A notification on this machine.', icon: Bell },
];

export function EscalationChannelsPage() {
  return (
    <>
      <Head title="Escalation channels">Where a question that waited too long reaches you. Each project picks its channel and how long to wait, under Defaults or its own settings.</Head>
      <ul className={ul}>
        <Slack />
        <Soon items={SOON} />
      </ul>
    </>
  );
}

/** The escalation settings page's footnote: whether Slack will act on the setting. */
export function SlackNote() {
  const v = useQuery(slackQuery).data;
  if (!v) return null;
  return v.bot ? (
    <>Slack is connected: a question waiting this long is posted to the channel, and can be answered there.{v.socket.state === 'error' ? ` Answers from Slack wait for its connection: ${v.socket.error}.` : ''}</>
  ) : (
    <>Slack is not connected (Settings → Connections → Escalation channels): waiting questions are only logged.</>
  );
}
