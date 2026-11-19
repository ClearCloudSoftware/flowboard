/**
 * Lamproom's database: SQLite at `<data>/lamproom.db`, read and written through Prisma (`prisma/schema.prisma`), so
 * moving to another database later is a new adapter and new migrations, not new queries. Tasks and backlog imports
 * live here; projects, settings and memory are still JSON files in the data folder.
 *
 * The first open of a data folder's database, in each process, applies the migrations Prisma wrote
 * (`prisma/migrations/<name>/migration.sql`) that it has not had yet, in name order, each in a transaction, and
 * records them in `_lamproom_migrations`. So the app needs neither Prisma's CLI nor its schema engine at run time.
 */
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFile } from './config.ts';
import { PrismaClient } from './generated/prisma/client.ts';

export type { PrismaClient };

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');

/** The database file of a data folder. */
export const dbFile = (dataDir: string) => join(dataDir, 'lamproom.db');

/** Applies the migrations `file` has not had; returns their names. */
export function migrate(file: string, dir = MIGRATIONS): string[] {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  try {
    // ponytail: SQLite only, like the migrations themselves; another database brings its own runner (or `prisma migrate deploy`)
    sqlite.exec('CREATE TABLE IF NOT EXISTS _lamproom_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set(sqlite.prepare('SELECT name FROM _lamproom_migrations').pluck().all() as string[]);
    const todo = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && isFile(join(dir, d.name, 'migration.sql')) && !done.has(d.name))
      .map((d) => d.name)
      .sort();
    for (const name of todo) {
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
        sqlite.prepare('INSERT INTO _lamproom_migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
      })();
    }
    return todo;
  } finally {
    sqlite.close();
  }
}

// One client per data folder, kept on globalThis so Next's reloads in development reuse it rather than open more.
const clients: Map<string, PrismaClient> = ((globalThis as { lamproomDb?: Map<string, PrismaClient> }).lamproomDb ??= new Map());

/** The data folder's database, migrated on its first open in this process. */
export function db(dataDir: string): PrismaClient {
  const file = resolve(dbFile(dataDir));
  let client = clients.get(file);
  if (!client) {
    migrate(file);
    client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
    clients.set(file, client);
  }
  return client;
}
