import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const containers: StartedTestContainer[] = [];

/**
 * Starts a throwaway PostgreSQL and Redis with Testcontainers (never the local dev database),
 * applies the real Prisma migrations and hands the URLs to the tests.
 */
export async function setup(project: {
  provide: (key: 'databaseUrl' | 'redisUrl', value: string) => void;
}): Promise<void> {
  const postgres = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  containers.push(postgres);

  const redis = await new GenericContainer('redis:8-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();
  containers.push(redis);

  const databaseUrl = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/test?schema=public`;
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  // The Prisma CLI lives in the repo root (devDependency of the workspace root).
  const prismaCli = path.join(REPO_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redisUrl);
}

export async function teardown(): Promise<void> {
  await Promise.all(containers.map((container) => container.stop()));
}
