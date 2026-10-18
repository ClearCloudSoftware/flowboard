/**
 * OpenCode server events -> NormalizedEvent. One normalizer per run, keyed to
 * the run's root session; child (subagent) sessions count as the run's own.
 * Streaming deltas are folded: a text or reasoning part is emitted once, when
 * it ends.
 */
import type { NormalizedEvent, Usage } from '@flowboard/core';
import type { Event } from '@opencode-ai/sdk/v2';
import { summarizeTool } from '../summarize.ts';

type ErrorLike = { name: string; data?: unknown } | undefined;
const describe = (e: ErrorLike) => `${e?.name ?? 'Error'}: ${(e?.data as { message?: string } | undefined)?.message ?? ''}`;

export function createNormalizer(rootSessionID: string): (event: Event) => NormalizedEvent[] {
  const ours = new Set([rootSessionID]);
  const userMessages = new Set<string>();
  const failedMessages = new Set<string>();
  const emittedParts = new Set<string>();
  const toolUses = new Set<string>();
  const toolResults = new Set<string>();
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0, costUsd: 0 };

  return (event) => {
    const raw = event;
    const props = event.properties as { sessionID?: string };
    if (event.type === 'session.created') {
      if (event.properties.info.parentID && ours.has(event.properties.info.parentID)) ours.add(event.properties.info.id);
      return [];
    }
    if (!props.sessionID || !ours.has(props.sessionID)) return [];

    switch (event.type) {
      case 'message.updated': {
        const info = event.properties.info;
        if (info.role === 'user') userMessages.add(info.id);
        else if (info.error && !failedMessages.has(info.id)) {
          failedMessages.add(info.id);
          return [{ type: 'error', message: describe(info.error), raw }];
        }
        return [];
      }

      case 'message.part.updated': {
        const part = event.properties.part;
        if (userMessages.has(part.messageID)) return [];
        if (part.type === 'text' || part.type === 'reasoning') {
          if (!part.time?.end || emittedParts.has(part.id) || (part.type === 'text' && part.synthetic)) return [];
          emittedParts.add(part.id);
          return [{ type: part.type === 'text' ? 'assistant_text' : 'thinking', text: part.text, raw }];
        }
        if (part.type === 'tool') {
          const { state, callID } = part;
          if (state.status === 'pending') return [];
          const out: NormalizedEvent[] = [];
          if (!toolUses.has(callID)) {
            toolUses.add(callID);
            out.push({ type: 'tool_use', name: part.tool, input: state.input, summary: summarizeTool(part.tool, state.input), raw });
          }
          if ((state.status === 'completed' || state.status === 'error') && !toolResults.has(callID)) {
            toolResults.add(callID);
            out.push(
              state.status === 'completed'
                ? { type: 'tool_result', ok: true, output: state.output, raw }
                : { type: 'tool_result', ok: false, output: state.error, raw },
            );
          }
          return out;
        }
        if (part.type === 'step-finish') {
          usage.input += part.tokens.input;
          usage.output += part.tokens.output + part.tokens.reasoning;
          usage.cacheRead += part.tokens.cache.read;
          usage.cacheWrite += part.tokens.cache.write;
          usage.numTurns += 1;
          usage.costUsd = (usage.costUsd ?? 0) + part.cost;
          return [{ type: 'usage', usage: { ...usage }, raw }];
        }
        return [];
      }

      case 'session.error':
        // OpenCode reports a context overflow, then compacts and carries on.
        if (event.properties.error?.name === 'ContextOverflowError') return [];
        return [{ type: 'error', message: describe(event.properties.error), raw }];

      case 'session.idle':
        return event.properties.sessionID === rootSessionID ? [{ type: 'result', usage: { ...usage }, raw }] : [];

      default:
        return [];
    }
  };
}
