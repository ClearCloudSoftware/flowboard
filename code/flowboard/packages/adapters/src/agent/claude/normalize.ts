/**
 * Claude Agent SDK messages -> NormalizedEvent. One normalizer per run: it
 * keeps the running usage and captures the session id once.
 *
 * See docs/FlowBoard/Agent Providers/Stream Parsing And Normalization.md.
 */
import { ZERO_USAGE } from '@flowboard/core';
import type { NormalizedEvent, Usage } from '@flowboard/core';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { summarizeTool } from '../summarize.ts';

type ApiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Overlay the fields an API usage object carries onto `base`; null or absent fields keep the base value. */
const overlay = (base: Usage, u: ApiUsage | null | undefined): Usage => ({
  ...base,
  input: u?.input_tokens ?? base.input,
  output: u?.output_tokens ?? base.output,
  cacheRead: u?.cache_read_input_tokens ?? base.cacheRead,
  cacheWrite: u?.cache_creation_input_tokens ?? base.cacheWrite,
});

const add = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  numTurns: a.numTurns + b.numTurns,
});

export function createNormalizer(): (msg: SDKMessage) => NormalizedEvent[] {
  let sessionSeen = false;
  let finished: Usage = ZERO_USAGE; // messages whose message_stop arrived
  // Messages streaming now, keyed by parent_tool_use_id: parallel subagents interleave their deltas.
  const streaming = new Map<string, Usage>();
  const running = () => [...streaming.values()].reduce(add, finished);

  return (msg) => {
    const raw = msg;
    const out: NormalizedEvent[] = [];

    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && !sessionSeen) {
          sessionSeen = true;
          out.push({ type: 'system', sessionId: msg.session_id, raw });
        }
        break;

      case 'stream_event': {
        const ev = msg.event as { type: string; message?: { usage?: ApiUsage }; usage?: ApiUsage };
        const key = msg.parent_tool_use_id ?? '';
        if (ev.type === 'message_start') {
          streaming.set(key, overlay(ZERO_USAGE, ev.message?.usage));
          out.push({ type: 'usage', usage: running(), raw });
        } else if (ev.type === 'message_delta') {
          // message_delta.usage is cumulative for its message: overwrite, never sum.
          streaming.set(key, overlay(streaming.get(key) ?? ZERO_USAGE, ev.usage));
          out.push({ type: 'usage', usage: running(), raw });
        } else if (ev.type === 'message_stop') {
          // A main-agent message is one turn, as the result's num_turns counts them; a subagent's is not.
          finished = add(finished, { ...(streaming.get(key) ?? ZERO_USAGE), numTurns: key === '' ? 1 : 0 });
          streaming.delete(key);
        }
        break;
      }

      case 'assistant':
        for (const block of msg.message.content) {
          if (block.type === 'text') out.push({ type: 'assistant_text', text: block.text, raw });
          else if (block.type === 'thinking') out.push({ type: 'thinking', text: block.thinking, raw });
          else if (block.type === 'tool_use') {
            out.push({ type: 'tool_use', name: block.name, input: block.input, summary: summarizeTool(block.name, block.input), raw });
          }
        }
        if (msg.error) out.push({ type: 'error', message: `assistant error: ${msg.error}`, raw });
        break;

      case 'user':
        if (Array.isArray(msg.message.content)) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_result') {
              out.push({ type: 'tool_result', ok: !block.is_error, output: block.content, raw });
            }
          }
        }
        break;

      case 'result': {
        const models = Object.values(msg.modelUsage ?? {});
        const tokens = models.length
          ? models.reduce(
              (u, m) =>
                add(u, {
                  input: m.inputTokens,
                  output: m.outputTokens,
                  cacheRead: m.cacheReadInputTokens,
                  cacheWrite: m.cacheCreationInputTokens,
                  numTurns: 0,
                }),
              ZERO_USAGE,
            )
          : overlay(ZERO_USAGE, msg.usage);
        out.push({ type: 'result', usage: { ...tokens, numTurns: msg.num_turns, costUsd: msg.total_cost_usd }, raw });
        if (msg.is_error) {
          // An is_error success (e.g. an API error turn) carries its text in `result`, not `errors`.
          const message = msg.subtype === 'success' ? msg.result : `${msg.subtype}: ${msg.errors.join('; ')}`;
          out.push({ type: 'error', message, raw });
        }
        break;
      }
    }
    return out;
  };
}
