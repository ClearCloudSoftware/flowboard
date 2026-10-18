/**
 * The ask_user shim: a stdio MCP server the agent's CLI launches. It forwards
 * each question to the broker over a Unix socket and relays the reply.
 *
 * See docs/FlowBoard/Human In The Loop/Ask User MCP Server.md.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkQuestions } from '@flowboard/core';
import type { Question } from '@flowboard/core';
import { askBroker } from './broker-client.ts';

const OptionsSchema = z.array(z.object({ value: z.string(), label: z.string() }));
const KindSchema = z.enum(['yes_no', 'single_select', 'multi_select', 'text', 'number']);

const QuestionSchema = z.object({
  id: z.string().describe('Unique within the batch; the answer comes back under this key'),
  prompt: z.string().describe('The question'),
  help: z.string().optional().describe('Extra context, shown under the question'),
  kind: KindSchema,
  options: OptionsSchema.optional().describe('Required for single_select and multi_select'),
  required: z.boolean().optional().describe('Defaults to true; an optional question may come back null'),
});

// Some models send nested values as JSON text, or spread a question's fields next to a plain-text
// `question`. The advertised schema allows both, so the call reaches us and is normalised below.
const LenientQuestion = QuestionSchema.extend({ options: z.union([OptionsSchema, z.string()]).optional() });
const Lenient = {
  question: z
    .union([LenientQuestion, z.string()])
    .describe('The question object; plain text also works when id and kind are given alongside'),
  id: z.string().optional().describe('Only when question is plain text'),
  kind: KindSchema.optional().describe('Only when question is plain text'),
  help: z.string().optional().describe('Only when question is plain text'),
  options: z.union([OptionsSchema, z.string()]).optional().describe('Only when question is plain text'),
  required: z.boolean().optional().describe('Only when question is plain text'),
};

/** The value, or the value parsed from JSON text when it is a string that holds JSON. */
function fromText(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** One question from whatever shape the model sent, or a message saying what is wrong. */
function toQuestion(raw: unknown, flat: Record<string, unknown> = {}): Question | string {
  let q = fromText(raw);
  if (typeof q === 'string') {
    if (flat.id === undefined || flat.kind === undefined) return 'a question given as plain text also needs id and kind';
    q = { ...flat, prompt: q };
  }
  const obj = q as Record<string, unknown>;
  const parsed = QuestionSchema.safeParse(obj.options === undefined ? obj : { ...obj, options: fromText(obj.options) });
  return parsed.success ? parsed.data : `invalid question: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'question'}: ${i.message}`).join('; ')}`;
}

/** Every question, or the first problem. */
function toQuestions(raw: unknown): Question[] | string {
  const list = fromText(raw);
  if (!Array.isArray(list)) return 'questions must be a list of question objects';
  const out: Question[] = [];
  for (const item of list) {
    const q = toQuestion(item);
    if (typeof q === 'string') return q;
    out.push(q);
  }
  return out;
}

type ToolResult = { isError?: boolean; content: { type: 'text'; text: string }[] };
const text = (t: string, isError = false): ToolResult => ({ ...(isError && { isError }), content: [{ type: 'text', text: t }] });

async function ask(socketPath: string, questions: Question[]): Promise<ToolResult> {
  const problem = checkQuestions(questions);
  if (problem) return text(problem, true);
  try {
    const reply = await askBroker(socketPath, { questions });
    // Relay anything but an error verbatim: the worker broker's park reply must pass through unchanged.
    return 'error' in reply ? text(reply.error, true) : text(JSON.stringify(reply));
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), true);
  }
}

export function createAskServer(socketPath: string): McpServer {
  const server = new McpServer({ name: 'flowboard', version: '0.1.0' });
  server.registerTool(
    'ask_user',
    {
      description:
        'Ask the user one question and wait for the answer. Returns {"answers": {"<id>": value}}: yes_no → boolean, single_select → option value, multi_select → array of values, text → string, number → number, a skipped optional question → null.',
      inputSchema: Lenient,
    },
    ({ question, ...flat }) => {
      const q = toQuestion(question, flat);
      return typeof q === 'string' ? text(q, true) : ask(socketPath, [q]);
    },
  );
  server.registerTool(
    'ask_user_batch',
    {
      description:
        'Ask the user several questions at once and wait until every required one is answered. Returns {"answers": {"<id>": value}} with the same value types as ask_user.',
      inputSchema: { questions: z.union([z.array(LenientQuestion), z.string()]).describe('A list of question objects') },
    },
    ({ questions }) => {
      const qs = toQuestions(questions);
      return typeof qs === 'string' ? text(qs, true) : ask(socketPath, qs);
    },
  );
  return server;
}
