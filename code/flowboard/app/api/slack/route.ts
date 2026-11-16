import { connection } from 'next/server';
import { z } from 'zod';
import { readAppSettings } from '../../../packages/cli/src/app-settings.ts';
import { escalationHost, readEscalations } from '../../../packages/cli/src/escalation.ts';
import { removeSlack, saveSlackTokens, slackTokens, testSlack } from '../../../packages/cli/src/slack.ts';
import { body, dataDir, refused } from '../flows/local.ts';

/** Slack as the Connections page shows it: which tokens are saved (never the tokens), the socket, the channels Slack refused. */
const view = () => {
  const t = slackTokens(dataDir());
  return {
    bot: !!t.bot,
    app: !!t.app,
    socket: escalationHost()?.state() ?? { state: 'off' },
    problems: Object.entries(readEscalations(dataDir()).problems).map(([channel, why]) => `Slack: ${channel}: ${why}`),
    address: readAppSettings(dataDir()).address,
  };
};

export async function GET(request: Request) {
  await connection();
  return refused(request) ?? Response.json(view());
}

const Tokens = z.object({ bot: z.string().optional(), app: z.string().optional() });

/** Saves `{ bot?, app? }` and reconnects; one left out keeps what is saved. */
export async function PUT(request: Request) {
  const no = refused(request);
  if (no) return no;
  const input = Tokens.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { bot?, app? }' }, { status: 400 });
  const r = saveSlackTokens(dataDir(), input.data);
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  escalationHost()?.refresh();
  return Response.json(view());
}

/** Forgets both tokens and disconnects; questions are only logged from then on. */
export async function DELETE(request: Request) {
  const no = refused(request);
  if (no) return no;
  removeSlack(dataDir());
  escalationHost()?.refresh();
  return Response.json(view());
}

/** `auth.test` with the saved bot token: the workspace and the bot's name. */
export async function POST(request: Request) {
  return refused(request) ?? Response.json(await testSlack(dataDir()));
}
