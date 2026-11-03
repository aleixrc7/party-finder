import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/AppRoutes';
import { createQueryClient } from './app/query-client';
import './index.css';

async function startMocksIfRequested() {
  if (import.meta.env.MODE === 'mocks') {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }
}

function mountApp() {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing #root element');
  }
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void startMocksIfRequested().then(mountApp);
