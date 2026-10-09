import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// With a config file Prisma no longer loads .env on its own, hence dotenv.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
