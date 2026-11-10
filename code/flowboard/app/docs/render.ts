import { Marked } from 'marked';

/** An Obsidian note (docs/FlowBoard is the vault) turned into HTML, plus its H2s for the page's contents list. */
export type Doc = { html: string; toc: { id: string; title: string }[] };

const VAULT = 'FlowBoard';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderDoc(md: string): Doc {
  const toc: Doc['toc'] = [];
  let section = '';
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = slug(text);
        if (depth === 2) {
          section = id;
          toc.push({ id, title: text });
        } else if (depth > 2) id = `${section}--${id}`; // every section repeats the same H3s
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      // mermaid.tsx draws these in the browser
      code: ({ text, lang }) => (lang === 'mermaid' ? `<pre class="mermaid">${esc(text)}</pre>\n` : false),
    },
  });

  const body = md
    .replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
    // [[Note|alias]] opens the note in Obsidian
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, note: string, alias?: string) => {
      const href = `obsidian://open?vault=${VAULT}&file=${encodeURIComponent(note)}`;
      return `<a class="wl" href="${href}" title="Open “${esc(note)}” in Obsidian">${esc(alias ?? note)}</a>`;
    });

  const html = (marked.parse(body, { async: false }) as string)
    // > [!note] Title  →  a callout with its title in bold
    .replace(
      /<blockquote>\s*<p>\[!(\w+)\][ \t]*([^\n<]*)\n?/g,
      (_, kind: string, title: string) =>
        `<blockquote class="callout ${kind.toLowerCase()}"><p>${title ? `<strong>${title}</strong><br>` : ''}`,
    );
  return { html, toc };
}
