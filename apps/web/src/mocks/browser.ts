import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export async function startMockWorker() {
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass' });
}
