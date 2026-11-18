/**
 * GET /api/projects/<id>/tasks?source=<id>&limit=<n>&offset=<n>
 * DELETE /api/projects/<id>/tasks?source=<id>
 *
 * GET returns the stored ParsedTask rows for a project, newest-updated first.
 * Optional `source` filter; optional pagination via limit + offset (defaults
 * 100 / 0, hard cap 500).
 *
 * DELETE clears all tasks for a (project, source) pair. Import history
 * (the imports table) is NOT cleared — the audit trail of "when we
 * imported, how many, did it succeed" survives a wipe.
 */

import { join } from 'node:path';
import { deleteTasks, listTasks, openDb } from '../../../../../packages/cli/src/storage.ts';
import { readProjects } from '../../../../../packages/cli/src/projects.ts';
import { dataDir, refused } from '../../../flows/local.ts';

type Params = { params: Promise<{ id: string }> };

const HARD_LIMIT = 500;

export async function GET(request: Request, { params }: Params) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;

  const projects = readProjects(dataDir());
  if (projects.find((p) => p.id === id) === undefined) {
    return Response.json({ error: `project not found: ${id}` }, { status: 404 });
  }

  const url = new URL(request.url);
  const sourceId = url.searchParams.get('source') ?? undefined;
  const limit = clamp(Number(url.searchParams.get('limit') ?? 100), 1, HARD_LIMIT);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);

  const db = openDb(join(dataDir(), 'lamproom.db'));
  const tasks = listTasks(db, id, { ...(sourceId !== undefined ? { sourceId } : {}), limit, offset });

  return Response.json({ tasks, offset, limit });
}

export async function DELETE(request: Request, { params }: Params) {
  const no = refused(request);
  if (no) return no;
  const { id } = await params;

  const projects = readProjects(dataDir());
  if (projects.find((p) => p.id === id) === undefined) {
    return Response.json({ error: `project not found: ${id}` }, { status: 404 });
  }

  const url = new URL(request.url);
  const sourceId = url.searchParams.get('source');
  if (sourceId === null || sourceId.trim() === '') {
    return Response.json({ error: 'missing ?source=<id>' }, { status: 400 });
  }

  const db = openDb(join(dataDir(), 'lamproom.db'));
  const deleted = deleteTasks(db, id, sourceId);
  return Response.json({ deleted });
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
