/** A unified diff read into numbered lines, for the diff view (diff.tsx). */

export interface DiffLine { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; old?: number; new?: number; text: string }

/** Reads a unified diff's hunks (from the first `@@`) into numbered lines. */
export function parsePatch(patch: string): DiffLine[] {
  let o = 0;
  let n = 0;
  const out: DiffLine[] = [];
  if (!patch) return out;
  for (const l of patch.replace(/\n$/, '').split('\n')) {
    if (l.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(l);
      o = Number(m?.[1] ?? 0);
      n = Number(m?.[2] ?? 0);
      out.push({ kind: 'hunk', text: l });
    } else if (l.startsWith('+')) out.push({ kind: 'add', new: n++, text: l.slice(1) });
    else if (l.startsWith('-')) out.push({ kind: 'del', old: o++, text: l.slice(1) });
    else if (l.startsWith('\\')) out.push({ kind: 'note', text: l.slice(2) }); // "No newline at end of file"
    else out.push({ kind: 'ctx', old: o++, new: n++, text: l.slice(1) });
  }
  return out;
}
