'use client';

import { useEffect } from 'react';

// Two overlapping runs (strict mode runs effects twice) would both draw the same blocks with the same ids.
let drawing: Promise<void> | undefined;

/** Draws the page's `pre.mermaid` blocks. Mermaid is loaded only here, so no other screen pays for it. */
export function Mermaid() {
  useEffect(() => {
    drawing ??= (async () => {
      const { default: mermaid } = await import('mermaid');
      await document.fonts.ready; // mermaid sizes boxes by measuring text, so the font must be there first
      mermaid.initialize({
        startOnLoad: false,
        deterministicIds: true, // the default ids are timestamps, so diagrams drawn in the same millisecond share one
        theme: 'base',
        // the real family name: mermaid can't measure with an unresolved var()
        fontFamily: getComputedStyle(document.body).getPropertyValue('--mono'),
        themeVariables: {
          background: '#fbfaf7',
          primaryColor: '#ffffff',
          primaryBorderColor: '#cfcbbe',
          primaryTextColor: '#17171c',
          lineColor: '#7a7880',
          secondaryColor: '#f4f2ec',
          tertiaryColor: '#edeae1',
          fontSize: '13px',
        },
        flowchart: { curve: 'linear' },
      });
      await mermaid.run({ querySelector: '.doc pre.mermaid:not([data-processed])' });
    })().finally(() => (drawing = undefined)); // a later visit to /docs draws its fresh blocks
  }, []);
  return null;
}
