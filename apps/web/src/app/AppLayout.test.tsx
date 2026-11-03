import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockState } from '@/mocks/state';
import { renderApp } from '@/test/render';

const sidebar = () => screen.getByRole('navigation', { name: 'Principal' });

describe('sidebar', () => {
  it('shows Calendario and Identificarse, but not Eventos, without a session', async () => {
    renderApp();

    expect(await screen.findByRole('link', { name: 'Identificarse' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendario' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Eventos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('shows Eventos, the username and Cerrar sesión with a session', async () => {
    renderApp('/', 'ana');

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(sidebar()).toHaveTextContent('ana');
    expect(screen.getByRole('link', { name: 'Eventos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Identificarse' })).not.toBeInTheDocument();
  });

  it('logs out and goes back to the anonymous sidebar, staying on the calendar', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('link', { name: 'Identificarse' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Eventos' })).not.toBeInTheDocument();
    expect(mockState.currentUserId).toBeNull();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('leaves the Eventos page when logging out there', async () => {
    const user = userEvent.setup();
    renderApp('/eventos', 'ana');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Identificarse' })).toBeInTheDocument();
  });
});

describe('route protection', () => {
  it('sends a visitor without a session from Eventos to Identificarse', async () => {
    renderApp('/eventos');

    expect(await screen.findByRole('heading', { name: 'Identificarse' })).toBeInTheDocument();
  });

  it('returns to Eventos after logging in', async () => {
    const user = userEvent.setup();
    renderApp('/eventos');

    await user.type(await screen.findByLabelText(/Nombre de usuario/), 'ana');
    await user.type(screen.getByLabelText(/Contraseña/), 'party-finder-dev');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Eventos' })).toBeInTheDocument();
  });

  it('shows a not found page for unknown routes', async () => {
    renderApp('/no-existe');

    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
