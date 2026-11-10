import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoc } from './render.ts';

test('renderDoc: front matter, section ids, wikilinks, callouts, and mermaid', () => {
  const { html, toc } = renderDoc(
    [
      '---',
      'tags: [x]',
      '---',
      '# Title',
      '> [!note] Design versus build',
      '> Body text.',
      '## Flow Design',
      '### Key concepts',
      'See [[Run Outcomes|how a run ends]] and [[Rework Loop]].',
      '## Execution',
      '### Key concepts',
      '```mermaid',
      'flowchart LR',
      '  A["a<br/>b"] --> B',
      '```',
      '```yaml',
      'a: 1',
      '```',
    ].join('\n'),
  );
  assert.doesNotMatch(html, /tags:/);
  assert.deepEqual(toc, [
    { id: 'flow-design', title: 'Flow Design' },
    { id: 'execution', title: 'Execution' },
  ]);
  assert.match(html, /<h3 id="flow-design--key-concepts">/);
  assert.match(html, /<h3 id="execution--key-concepts">/);
  assert.match(html, /<a class="wl" href="obsidian:\/\/open\?vault=FlowBoard&file=Run%20Outcomes"[^>]*>how a run ends<\/a>/);
  assert.match(html, /file=Rework%20Loop"[^>]*>Rework Loop<\/a>/);
  assert.match(html, /<blockquote class="callout note"><p><strong>Design versus build<\/strong><br>Body text\./);
  assert.match(html, /<pre class="mermaid">flowchart LR\n {2}A\[&quot;a&lt;br\/&gt;b&quot;\] --&gt; B<\/pre>/);
  assert.match(html, /<code class="language-yaml">a: 1/);
});
