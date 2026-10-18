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

const QuestionSchema = z.object({
  id: z.string().describe('Unique within the batch; the answer comes back under this key'),
  prompt: z.string().describe('The question'),
  help: z.string().optional().describe('Extra context, shown under the question'),
  kind: z.enum(['yes_no', 'single_select', 'multi_select', 'text', 'number']),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional()
    .describe('Required for single_select and multi_select'),
  required: z.boolean().optional().describe('Defaults to true; an optional question may come back null'),
});

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
      inputSchema: { question: QuestionSchema },
    },
    ({ question }) => ask(socketPath, [question]),
  );
  server.registerTool(
    'ask_user_batch',
    {
      description:
        'Ask the user several questions at once and wait until every required one is answered. Returns {"answers": {"<id>": value}} with the same value types as ask_user.',
      inputSchema: { questions: z.array(QuestionSchema) },
    },
    ({ questions }) => ask(socketPath, questions),
  );
  return server;
}
