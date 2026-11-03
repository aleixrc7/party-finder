import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// With a config file Prisma no longer loads .env on its own, hence dotenv.
// .env.local wins over .env; a missing file is ignored.
config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
