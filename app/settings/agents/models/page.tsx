import type { Metadata } from 'next';
import { OpencodeModelsPage } from '../../models.tsx';

export const metadata: Metadata = { title: 'OpenCode models · Settings · Lamproom' };

/** `/settings/agents/models`: the models an OpenCode step may run on. */
export default function Page() {
  return <OpencodeModelsPage />;
}
