import type { Metadata } from 'next';
import { OpenRouterPage } from '../../models.tsx';

export const metadata: Metadata = { title: 'OpenRouter · Settings · Lamproom' };

/** `/settings/llm-providers/openrouter`: the key OpenCode's steps run on. */
export default function Page() {
  return <OpenRouterPage />;
}
