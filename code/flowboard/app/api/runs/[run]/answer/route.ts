import { z } from 'zod';
import { answerAsk } from '../../../../../packages/cli/src/flow-logs.ts';
import { body, refused, runsDir } from '../../../flows/local.ts';

const Answer = z.object({ id: z.string().regex(/^[\w-]+$/), answers: z.record(z.string(), z.unknown()) });

/** Answers an open question or gate of the run, `{ id, answers }`; the run's host picks it up. */
export async function POST(request: Request, { params }: { params: Promise<{ run: string }> }) {
  const no = refused(request);
  if (no) return no;
  const { run } = await params;
  const input = Answer.safeParse(await body(request));
  if (!input.success) return Response.json({ error: 'send { id, answers }' }, { status: 400 });
  const why = answerAsk(runsDir(), run, input.data.id, input.data.answers);
  return why ? Response.json({ error: why }, { status: 409 }) : Response.json({ ok: true });
}
