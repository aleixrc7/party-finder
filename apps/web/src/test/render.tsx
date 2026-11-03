import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '@/app/AppRoutes';
import { createQueryClient } from '@/app/query-client';
import { signInAs } from '@/mocks/state';

function Providers({ children, route }: { children: ReactNode; route: string }) {
  return (
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}

export function renderWithProviders(ui: ReactNode, route = '/') {
  return render(<Providers route={route}>{ui}</Providers>);
}

export function renderApp(route = '/', username?: string) {
  if (username) {
    signInAs(username);
  }
  return renderWithProviders(<AppRoutes />, route);
}
