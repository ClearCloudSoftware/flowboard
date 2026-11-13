/** A stand-in for the `gh` CLI in tests. */
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** `a b *`: the literal parts quoted for `case`, so only `*` is a wildcard. */
const pattern = (glob: string) => glob.split('*').map((part) => (part ? `'${part.replace(/'/g, `'\\''`)}'` : '')).join('*');

/** A stand-in `gh`: each case is a glob over its arguments (only `*` is special), then the shell that answers it. */
export const fakeGh = (cases: Record<string, string>) => {
  const file = join(realpathSync(mkdtempSync(join(tmpdir(), 'fb-gh-'))), 'gh');
  const body = Object.entries(cases).map(([glob, sh]) => `  ${pattern(glob)}) ${sh} ;;`).join('\n');
  writeFileSync(file, `#!/bin/sh\ncase "$*" in\n${body}\n  *) echo "unexpected: $*" >&2; exit 99 ;;\nesac\n`);
  chmodSync(file, 0o755);
  return file;
};
