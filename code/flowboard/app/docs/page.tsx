import type { Metadata } from 'next';
import { loadDoc } from './load.ts';
import { Mermaid } from './mermaid.tsx';
import '../flows/flows.css';
import './docs.css';

export const metadata: Metadata = { title: 'Docs · FlowBoard' };

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
