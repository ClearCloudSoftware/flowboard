import type { Metadata } from 'next';
import { Projects } from './projects/list.tsx';

export const metadata: Metadata = { title: 'Projects · Lamproom' };

/** `/`: the projects list. Everything on it loads in the browser, from /api/projects. */
export default function Home() {
  return <Projects />;
}
