import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { resetCsrfToken } from '@/lib/api/client';
import { server } from '@/mocks/server';
import { resetMockState } from '@/mocks/state';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T12:00:00') });
  resetMockState();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockState();
  resetCsrfToken();
  document.head.querySelectorAll('meta[name="referrer"]').forEach((meta) => meta.remove());
});

afterAll(() => {
  server.close();
  vi.useRealTimers();
});
