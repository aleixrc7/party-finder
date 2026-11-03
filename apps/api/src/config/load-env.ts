import { loadEnvFiles } from './env';

/**
 * Import this module FIRST in `main.ts`. `@prisma/client` loads the root `.env` into
 * `process.env` as soon as it is imported, and variables that are already set are never
 * overwritten, so `.env.local` must be loaded before any other import runs.
 */
loadEnvFiles();
