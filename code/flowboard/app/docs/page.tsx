import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Mermaid } from './mermaid.tsx';
import { renderDoc } from './render.ts';
import '../flows/flows.css';
import './docs.css';

export const metadata: Metadata = { title: 'Docs · FlowBoard' };

// The Obsidian note stays the source; this page only renders it.
const SOURCE = path.join(process.cwd(), '../../docs/FlowBoard/Running Agent Work.md');

// Prerendered with the route; 'minutes' re-reads the note at most a minute after you edit it.
async function loadDoc() {
  'use cache';
  cacheLife('minutes');
  return renderDoc(await readFile(SOURCE, 'utf8'));
}

/** `flowboard/docs`: how FlowBoard runs agent work, rendered from the vault note. */
export default async function DocsPage() {
  // ponytail: trusted repo file, so its HTML goes in unsanitized; sanitize if docs ever come from outside the repo
  const { html, toc } = await loadDoc();
  return (
    <div className="fd">
      <header className="topbar">
        <div className="brand">
          flowboard<em>/</em>
          <span>docs</span>
        </div>
        <span className="sp" />
        <Link className="act" href="/flows">
          Flows
        </Link>
        <Link className="act" href="/runs">
          Runs
        </Link>
      </header>
      <div className="doc-body">
        <nav className="doc-toc" aria-label="On this page">
          <span className="lbl">on this page</span>
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`}>
              {t.title}
            </a>
          ))}
        </nav>
        <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <Mermaid />
    </div>
  );
}
