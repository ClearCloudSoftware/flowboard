/**
 * The SQLite database singleton.
 *
 * `openDb(path)` is memoised per absolute path — pass the same path twice,
 * get the same handle. The handle is a Drizzle instance; raw SQL drops to
 * `(db as any).$client` if ever needed but storage.ts sticks to Drizzle.
 *
 * On first open for a path:
 *   - the parent directory is created (recursive)
 *   - WAL journal mode + 5s busy_timeout + foreign_keys ON are set
 *   - migrations under packages/cli/drizzle/ are applied
 *
 * See docs/superpowers/plans/2026-11-19-task-storage-and-intake.md Task 3.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LamproomDb = BetterSQLite3Database<Record<string, never>>;

const cache = new Map<string, LamproomDb>();

// Compute the drizzle folder off this file's dirname rather than
// `new URL('../drizzle', import.meta.url)`. Turbopack intercepts the
// latter pattern (it treats the first arg as an asset module specifier
// at build time) and refuses the build with "Can't resolve '../drizzle'"
// when this file is pulled into a Next.js server bundle.
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolvePath(join(THIS_DIR, '..', 'drizzle'));

export function openDb(path: string): LamproomDb {
  const abs = resolvePath(path);
  const hit = cache.get(abs);
  if (hit !== undefined) return hit;

  mkdirSync(dirname(abs), { recursive: true });
  const raw = new Database(abs);
  raw.pragma('journal_mode = WAL');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('foreign_keys = ON');

  const db = drizzle(raw);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  cache.set(abs, db);
  return db;
}

/** Test-only: forget a cached handle so the next open re-runs migrations. */
export function _forgetDbForTest(path: string): void {
  cache.delete(resolvePath(path));
}
