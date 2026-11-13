import type { Metadata } from 'next';
import { OpencodeModelsPage } from '../../openrouter.tsx';

export const metadata: Metadata = { title: 'OpenCode models · Settings · FlowBoard' };

/** `/settings/agents/models`: the models an OpenCode step may run on. */
export default function Page() {
  return <OpencodeModelsPage />;
}
