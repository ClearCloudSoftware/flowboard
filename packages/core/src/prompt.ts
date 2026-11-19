import type { ArtifactRef, PromptParts } from './ports/agent-provider.ts';

const list = (heading: string, refs: ArtifactRef[]) =>
  refs.length ? `${heading}\n${refs.map((r) => `- ${r.type}: ${r.path}`).join('\n')}` : '';

/** Render the prompt parts in canonical order (PRD §7), recalled memory just before the closing, skipping empty ones. */
export function renderPrompt(parts: PromptParts): string {
  return [
    parts.preamble,
    list('Read these first:', parts.inputs),
    list('Write your output to:', parts.outputs),
    parts.invocation,
    parts.template,
    parts.memory,
    parts.closing,
  ]
    .filter(Boolean)
    .join('\n\n');
}
