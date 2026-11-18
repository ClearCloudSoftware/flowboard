/**
 * GET /api/imports/<id>
 *
 * Returns the current ImportRow — state, counters, started/ended, error.
 * Polled by the UI's import progress toast every 1.5s until state !== 'running'.
 */

import { join } from 'node:path';
import { getImport, openDb } from '../../../../packages/cli/src/storage.ts';
import { dataDir, refused } from '../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;

  const db = openDb(join(dataDir(), 'lamproom.db'));
  const row = getImport(db, id);
  if (row === undefined) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json(row);
}
