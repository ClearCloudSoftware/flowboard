/** A file's patch with old and new line numbers, as docs/mockups/land-workspace.html draws it. */

import { parsePatch } from './diff-lines.ts';

const SIGN = { add: '+', del: '−', ctx: '', hunk: '', note: '' } as const;

export function Diff({ patch, binary, command }: { patch: string; binary: boolean; command: string }) {
  const rows = binary ? [] : parsePatch(patch);
  const cut = patch.split('\n').length >= 3000;
  return (
    <div className="ws-diff">
      {binary && <div className="dl k-note"><span className="tx">binary file: no text diff</span></div>}
      {!binary && rows.length === 0 && <div className="dl k-note"><span className="tx">no change to the text (a mode or a rename only)</span></div>}
      {rows.map((r, k) => (
        <div key={k} className={`dl k-${r.kind}`}>
          <span className="ln">{r.old ?? ''}</span>
          <span className="ln">{r.new ?? ''}</span>
          <span className="sg">{SIGN[r.kind]}</span>
          <span className="tx">{r.text}</span>
        </div>
      ))}
      {cut && <div className="dl k-note"><span className="tx">… cut at 3000 lines; the command below shows all of it</span></div>}
      <div className="ws-cmd">{command}</div>
    </div>
  );
}
