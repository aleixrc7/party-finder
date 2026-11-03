import './config/load-env'; // must stay first: see the file
import 'reflect-metadata';
import { createApp } from './app';
import { parseEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  const app = await createApp({ env });
  // Without API_HOST Fastify binds every `localhost` address (127.0.0.1 and ::1).
  await app.listen({ port: env.API_PORT, ...(env.API_HOST ? { host: env.API_HOST } : {}) });
}

bootstrap().catch((error: unknown) => {
  // Only the message: config errors list variable names, never values.
  console.error(error instanceof Error ? error.message : 'Failed to start the API');
  process.exit(1);
});
