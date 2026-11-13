import type { Metadata } from 'next';
import { OpenRouterPage } from '../../openrouter.tsx';

export const metadata: Metadata = { title: 'OpenRouter · Settings · FlowBoard' };

/** `/settings/connections/openrouter`: the key OpenCode's steps run on. */
export default function Page() {
  return <OpenRouterPage />;
}
