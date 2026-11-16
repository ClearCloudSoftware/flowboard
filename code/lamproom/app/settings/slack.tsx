'use client';
/**
 * Connections → Escalation channels: Slack, the one channel built (its two tokens, a test, the socket's state, the
 * channels it refused, and the address its links point at); the others are coming soon. Loads /api/slack.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CircleQuestionMark, Copy, Mail, MessageSquare, TriangleAlert, Webhook } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ADDRESS, ADDRESS_RE } from '../../packages/cli/src/settings.ts';
import { removeSlackTokens, saveSlackTokens, type SlackView, slackQuery, testSlackTokens, updateAppSettings } from '../projects/api.ts';
import { ErrorLine, Head, icon, Row, Soon, ul } from './settings.tsx';
import { Loader } from '@/components/loader';

const warn = 'm-0 flex items-start gap-2 border-l-[3px] border-wait bg-[var(--wait-soft)] px-2.5 py-1.5 font-sans text-xs text-wait';
const small = 'text-[11px] text-muted-foreground';

// The Slack app Lamproom needs: a bot that may post (chat:write), buttons and modals (interactivity), over Socket Mode.
const MANIFEST = `display_information:
  name: Lamproom
  description: Questions from Lamproom runs that waited too long, answered in place.
features:
  bot_user:
    display_name: Lamproom
    always_online: false
oauth_config:
  scopes:
    bot:
      - chat:write
settings:
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
`;

const h = 'm-0 mt-1 font-sans text-[13px] font-semibold';
const k = 'bg-muted px-1 font-mono text-[12px]';

function CopyManifest() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="absolute top-1.5 right-1.5 h-6 gap-1 px-2 text-[11px]"
      onClick={() => navigator.clipboard.writeText(MANIFEST).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
    >
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** The round help button on the Slack row: how to make the Slack app and connect it, in a modal. */
function SlackHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label="How to set up Slack" title="How to set up Slack" className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <CircleQuestionMark className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto font-sans sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-sans">Set up Slack</DialogTitle>
          <DialogDescription>
            About ten minutes, once. You make a small Slack app in your workspace, paste its two tokens here, and invite its bot to the channels your projects escalate to. Lamproom connects out to Slack over Socket Mode, so this machine needs no public address.
          </DialogDescription>
        </DialogHeader>
        <ol className="m-0 grid list-decimal gap-3 pl-5 text-[13px] leading-relaxed">
          <li>
            <p className={h}>Create the app from a manifest</p>
            Open{' '}
            <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="underline">
              api.slack.com/apps
            </a>
            , choose <b>Create New App</b> → <b>From a manifest</b>, pick your workspace, switch the editor to <b>YAML</b>, replace what is there with this, then <b>Next</b> → <b>Create</b>:
            <div className="relative mt-1.5">
              <pre className="m-0 overflow-x-auto border border-border bg-muted/50 p-2.5 font-mono text-[12px] leading-snug">{MANIFEST}</pre>
              <CopyManifest />
            </div>
            <span className={small}>
              <code>chat:write</code> lets the bot post and update its messages; interactivity gives it the <b>Answer</b> button and modal; Socket Mode means there is no request URL and no signing secret.
            </span>
          </li>
          <li>
            <p className={h}>Install it and copy the bot token</p>
            In the app&rsquo;s <b>Install App</b> page (or <b>OAuth &amp; Permissions</b>), choose <b>Install to Workspace</b> and <b>Allow</b>. Copy the <b>Bot User OAuth Token</b>; it starts with <code className={k}>xoxb-</code>.
          </li>
          <li>
            <p className={h}>Make the app-level token</p>
            In <b>Basic Information</b> → <b>App-Level Tokens</b>, choose <b>Generate Token and Scopes</b>, name it (say <i>socket</i>), add the scope <code className={k}>connections:write</code>, and <b>Generate</b>. Copy the token; it starts with <code className={k}>xapp-</code>.
          </li>
          <li>
            <p className={h}>Paste both here</p>
            Paste the <code className={k}>xoxb-</code> token in <b>Bot token</b> and the <code className={k}>xapp-</code> token in <b>App-level token</b>, then <b>Save</b> and <b>Test</b>. Test names the workspace and the bot, and within a few seconds the line above reads <i>Connected to &lt;workspace&gt;</i>. The tokens are kept in <code>secrets.json</code> in Lamproom&rsquo;s data folder; no page shows them again.
          </li>
          <li>
            <p className={h}>Invite the bot to your channels</p>
            In Slack, in each channel a project escalates to, type <code className={k}>/invite @Lamproom</code>. The default channel is <code className={k}>#lamproom</code>; change it, and how many minutes a question waits first, under <b>Settings → Defaults</b> or in a project&rsquo;s own settings. A channel the bot is not in shows as a problem on this page.
          </li>
          <li>
            <p className={h}>Check the Lamproom address</p>
            Each Slack message has an <b>Open in Lamproom</b> link. If you reach Lamproom on anything other than <code className={k}>http://localhost:3000</code>, set <b>Lamproom address</b> below so the link works.
          </li>
        </ol>
        <div className="grid gap-1 border-t border-border pt-3 text-[13px] leading-relaxed">
          <p className={h}>What happens then</p>
          <p className="m-0">
            A question a run asks that nobody answers in Lamproom within the project&rsquo;s wait is posted to its channel. <b>Answer</b> opens a modal in Slack; the first answer, in Slack or in Lamproom, wins, and the message is updated either way. A project&rsquo;s budget alert and cap are posted to the same channel, once each a month. Answers from Slack need Lamproom running: it holds the connection.
          </p>
          <p className={h}>If it does not connect</p>
          <ul className="m-0 grid list-disc gap-0.5 pl-5">
            <li>
              <i>Slack refused the bot token</i> (or <i>the app-level token</i>): it was mistyped, revoked, or pasted in the other box. The bot token starts with <code className={k}>xoxb-</code>, the app-level one with <code className={k}>xapp-</code>.
            </li>
            <li>
              Another error from <code>apps.connections.open</code>, such as <i>missing_scope</i>: the app-level token lacks <code className={k}>connections:write</code>, or Socket Mode is off under the app&rsquo;s <b>Socket Mode</b> page.
            </li>
            <li>
              <i>The bot is not in the channel</i> or <i>no such channel</i>: invite the bot, or fix the channel&rsquo;s name under Defaults or the project&rsquo;s settings.
            </li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
      <label htmlFor="lr-address" className="font-sans text-xs font-semibold">
        Lamproom address
      </label>
      <span className={small}>Where Slack&rsquo;s Open in Lamproom links point: this machine&rsquo;s address as your browser reaches it.</span>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="lr-address" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} aria-invalid={bad || undefined} className="h-8 w-72 font-mono text-[13px]" />
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
    <Row icon={icon(MessageSquare)} name="Slack" help={<SlackHelp />} text="A question nobody answered in Lamproom is posted to the channel a project's escalation names, after its wait, and can be answered there; the first answer, here or there, wins. A project's budget alert and cap are posted too.">
      {!v ? (
        view.isError ? <ErrorLine error={view.error} /> : <Loader className="text-xs" size={16} />
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
            Saved in <code>secrets.json</code> in Lamproom&rsquo;s data folder, apart from its settings; no page reads them back. The ? beside Slack shows how to make the Slack app and where each token comes from.
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
  { id: 'email', name: 'Email', text: 'A link to the question in the inbox; the answer is given in Lamproom.', icon: Mail },
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
