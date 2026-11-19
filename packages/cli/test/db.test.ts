import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { db, dbFile, migrate } from '../src/db.ts';

const temp = () => mkdtempSync(join(tmpdir(), 'lr-db-'));

test('db: a new data folder gets its database with every migration, once', async () => {
  const data = temp();
  const client = db(data);
  assert.equal(db(data), client, 'one client per data folder');
  assert.deepEqual(await client.task.findMany(), []);
  assert.deepEqual(migrate(dbFile(data)), [], 'nothing left to apply');
});

test('db: migrations apply in name order, each once; a failing one leaves no trace', () => {
  const dir = temp();
  const add = (name: string, sql: string) => {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'migration.sql'), sql);
  };
  add('2_b', 'CREATE TABLE b (x);');
  add('1_a', 'CREATE TABLE a (x);');
  const file = join(temp(), 'sub', 'lamproom.db');
  assert.deepEqual(migrate(file, dir), ['1_a', '2_b']);
  add('3_bad', 'CREATE TABLE c (x); CREATE TABLE a (x);');
  assert.throws(() => migrate(file, dir), /already exists/);
  const sqlite = new Database(file);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('a', 'b', 'c') ORDER BY name").pluck().all(), ['a', 'b']);
  sqlite.close();
});
