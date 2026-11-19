// Prisma's CLI settings. `DATABASE_URL` names the database to migrate; generating the client needs none.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' },
});
