import type { Metadata } from 'next';
import { OllamaPage } from '../../models.tsx';

export const metadata: Metadata = { title: 'Ollama · Settings · Lamproom' };

/** `/settings/connections/ollama`: Ollama on this machine, where OpenCode's local models run. */
export default function Page() {
  return <OllamaPage />;
}
