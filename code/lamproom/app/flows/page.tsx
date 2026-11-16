import type { Metadata } from 'next';
import { Designer } from './designer.tsx';
import './flows.css';

export const metadata: Metadata = { title: 'Flows · Lamproom' };

/** `lamproom/flows`: the flow designer. Everything on it loads in the browser, from /api/flows. */
export default function FlowsPage() {
  return <Designer />;
}
