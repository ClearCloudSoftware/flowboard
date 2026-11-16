import { z } from 'zod';
import { noteAnswered } from '../../../../../packages/cli/src/escalation.ts';
import { answerAsk } from '../../../../../packages/cli/src/flow-logs.ts';
import { body, dataDir, refused, runsDir } from '../../../flows/local.ts';

const Answer = z.object({ id: z.string().regex(/^[\w-]+$/), answers: z.record(z.string(), z.unknown()) });

/** Answers an open question or gate of the run, `{ id, answers }`; the run's host picks it up, and a Slack message of it is repainted. */
export async function POST(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const input = Answer.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { id, answers }' }, { status: 400 });
  const why = answerAsk(runsDir(), run, input.data.id, input.data.answers);
  if (why) return Response.json({ error: why }, { status: 409 });
  void noteAnswered(dataDir(), runsDir(), run, input.data.id, input.data.answers, 'Lamproom').catch((e) => console.error(`-- escalation: ${(e as Error).message}`));
  return Response.json({ ok: true });
}
