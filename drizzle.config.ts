import type { Config } from 'drizzle-kit';

/**
 * Drizzle configuration for Lamproom's SQLite database.
 *
 * `pnpm exec drizzle-kit generate` reads the schema at `packages/cli/src/schema.ts`
 * and writes SQL migrations into `packages/cli/drizzle/`. The migrator is run on
 * first DB open from `packages/cli/src/db.ts` — no manual `pnpm db:migrate` step.
 *
 * `dbCredentials.url` is only used by drizzle-kit's own introspection commands
 * (`drizzle-kit studio`). The running app computes its own path from
 * LAMPROOM_DATA_DIR + 'lamproom.db'.
 */
export default {
  schema: './packages/cli/src/schema.ts',
  out: './packages/cli/drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: 'file:data/lamproom.db' },
  strict: true,
  verbose: true,
} satisfies Config;
