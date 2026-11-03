import { endpoints } from '@party-finder/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE_URL } from '@/lib/api/client';
import { server } from '@/mocks/server';
import { mockState } from '@/mocks/state';
import { renderApp } from '@/test/render';
import { monthGridDays, toIsoDate } from './dates';

const DAY_WITH_ONE_OWN_AND_ONE_FOREIGN = '10 de octubre';
const FULL_DAY = '12 de octubre';
const EMPTY_DAY = '20 de octubre';

async function findDay(day: string) {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  return screen.getByRole('gridcell', { name: new RegExp(day) });
}

async function openMenu(day: string) {
  fireEvent.contextMenu(await findDay(day));
  return screen.findByRole('menu');
}

describe('monthly grid', () => {
  it('builds whole weeks starting on Monday and no longer than the API range limit', () => {
    const days = monthGridDays(new Date('2026-10-15T12:00:00'));

    expect(toIsoDate(days[0] ?? new Date())).toBe('2026-09-28');
    expect(toIsoDate(days.at(-1) ?? new Date())).toBe('2026-11-01');
    expect(days.length % 7).toBe(0);
    expect(days.length).toBeLessThanOrEqual(42);
  });

  it('shows the month, every day and each event with name and type', async () => {
    renderApp();

    expect(screen.getByRole('heading', { name: /octubre 2026/i })).toBeInTheDocument();
    const cell = await findDay(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);
    expect(
      within(cell).getByRole('button', { name: /LAN en casa de Ana.*LAN PARTY/ }),
    ).toBeVisible();
    expect(within(cell).getByRole('button', { name: /Campaña de D&D.*D&D/ })).toBeVisible();
    expect(screen.getAllByRole('gridcell')).toHaveLength(35);
  });

  it('shows up to 4 events in a cell', async () => {
    renderApp();

    expect(within(await findDay(FULL_DAY)).getAllByRole('button')).toHaveLength(4);
  });

  it('navigates between months and fetches the new range', async () => {
    const user = userEvent.setup();
    const ranges: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getCalendar.path}`, ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get('from') ?? '';
        const to = url.searchParams.get('to') ?? '';
        ranges.push(`${from}/${to}`);
        return HttpResponse.json({ from, to, entries: [] });
      }),
    );
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(screen.getByRole('heading', { name: /noviembre 2026/i })).toBeInTheDocument();
    await waitFor(() => expect(ranges).toContain('2026-10-26/2026-12-06'));
    expect(await screen.findByText('No hay eventos este mes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.getByRole('heading', { name: /septiembre 2026/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByRole('heading', { name: /octubre 2026/i })).toBeInTheDocument();
  });

  it('shows a loading state while fetching', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getCalendar.path}`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderApp();

    expect(await screen.findByText('Cargando eventos…')).toBeInTheDocument();
  });

  it('shows the error state and retries', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getCalendar.path}`, () =>
        HttpResponse.json(
          { code: 'VALIDATION_ERROR', message: 'Datos no válidos' },
          { status: 400 },
        ),
      ),
    );
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos no válidos');
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('moves focus between days with the arrow keys', async () => {
    const user = userEvent.setup();
    renderApp();
    const cell = await findDay(EMPTY_DAY);

    cell.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('gridcell', { name: /21 de octubre/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('gridcell', { name: /28 de octubre/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(screen.getByRole('gridcell', { name: /20 de octubre/ })).toHaveFocus();
  });
});

describe('context menu permissions', () => {
  it('does not open without a session', async () => {
    renderApp();

    fireEvent.contextMenu(await findDay(EMPTY_DAY));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Añadir evento')).not.toBeInTheDocument();
  });

  it('offers Añadir evento with a session and hides Eliminar evento without own entries', async () => {
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    const menu = await openMenu(EMPTY_DAY);

    expect(within(menu).getByRole('menuitem', { name: 'Añadir evento' })).toBeEnabled();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Eliminar evento' }),
    ).not.toBeInTheDocument();
  });

  it('disables Añadir evento when the day has 4 events', async () => {
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    const menu = await openMenu(FULL_DAY);

    expect(within(menu).getByRole('menuitem', { name: 'Añadir evento' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('lists only the entries the user added in the Eliminar evento submenu', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    const menu = await openMenu(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);
    await user.click(within(menu).getByRole('menuitem', { name: 'Eliminar evento' }));

    const submenu = (await screen.findAllByRole('menu')).at(-1);
    if (!submenu) {
      throw new Error('Submenu not found');
    }
    expect(within(submenu).getByRole('menuitem', { name: 'LAN en casa de Ana' })).toBeVisible();
    expect(
      within(submenu).queryByRole('menuitem', { name: 'Campaña de D&D' }),
    ).not.toBeInTheDocument();
  });

  it('is usable with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    const cell = await findDay(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);

    cell.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu');
    await waitFor(() =>
      expect(within(menu).getByRole('menuitem', { name: 'Añadir evento' })).toHaveFocus(),
    );
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar evento' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'LAN en casa de Ana' })).toHaveFocus();
    await user.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('does not open from the keyboard without a session', async () => {
    const user = userEvent.setup();
    renderApp();
    const cell = await findDay(EMPTY_DAY);

    cell.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('adding an event', () => {
  async function openAddDialog(day: string) {
    const user = userEvent.setup();
    const menu = await openMenu(day);
    await user.click(within(menu).getByRole('menuitem', { name: 'Añadir evento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir evento' });
    await within(dialog).findByLabelText(/Plazas/);
    return { user, dialog };
  }

  it('offers capacities 1 to 10, defaulting to the template attendees', async () => {
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    const { user, dialog } = await openAddDialog(EMPTY_DAY);
    const capacity = within(dialog).getByLabelText<HTMLSelectElement>(/Plazas/);
    const template = within(dialog).getByLabelText(/Evento/);

    expect(
      within(capacity)
        .getAllByRole('option')
        .map(({ textContent }) => textContent),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(capacity).toHaveValue('6');

    await user.selectOptions(
      template,
      within(dialog).getByRole('option', { name: 'Campaña de D&D' }),
    );
    expect(capacity).toHaveValue('4');

    await user.selectOptions(capacity, '9');
    expect(capacity).toHaveValue('9');

    await user.selectOptions(template, 'Paseo por el parque');
    expect(capacity).toHaveValue('1');
  });

  it('creates the entry, closes the dialog and shows it on the day', async () => {
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    const { user, dialog } = await openAddDialog(EMPTY_DAY);
    await user.selectOptions(within(dialog).getByLabelText(/Plazas/), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir evento' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const cell = screen.getByRole('gridcell', { name: new RegExp(EMPTY_DAY) });
    expect(await within(cell).findByRole('button', { name: /LAN en casa de Ana/ })).toBeVisible();
    const created = mockState.entries.at(-1);
    expect(created).toMatchObject({ date: '2026-10-20', capacity: 2 });
  });

  it('shows the API message when the day filled up in the meantime', async () => {
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    const { user, dialog } = await openAddDialog(EMPTY_DAY);
    server.use(
      http.post(`${API_BASE_URL}${endpoints.createCalendarEntry.path}`, () =>
        HttpResponse.json(
          { code: 'DAY_FULL', message: 'Este día ya tiene 4 eventos' },
          { status: 409 },
        ),
      ),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Añadir evento' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Este día ya tiene 4 eventos',
    );
  });

  it('shows an empty state when there are no templates', async () => {
    mockState.templates = [];
    mockState.entries = [];
    renderApp('/', 'carla');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    const user = userEvent.setup();

    const menu = await openMenu(EMPTY_DAY);
    await user.click(within(menu).getByRole('menuitem', { name: 'Añadir evento' }));

    expect(await screen.findByText('Todavía no hay eventos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crea uno en Eventos' })).toBeInTheDocument();
  });
});

describe('deleting an event', () => {
  it('removes the entry after confirming and clears the panel', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    const cell = await findDay(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);
    await user.click(within(cell).getByRole('button', { name: /LAN en casa de Ana/ }));

    const menu = await openMenu(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);
    await user.click(within(menu).getByRole('menuitem', { name: 'Eliminar evento' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'LAN en casa de Ana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar evento' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        within(cell).queryByRole('button', { name: /LAN en casa de Ana/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No hay evento seleccionado')).toBeInTheDocument();
  });

  it('keeps the dialog open with the API message when the server refuses', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    server.use(
      http.delete(`${API_BASE_URL}/calendar/entries/:id`, () =>
        HttpResponse.json(
          { code: 'FORBIDDEN', message: 'No tienes permiso para esta acción' },
          { status: 403 },
        ),
      ),
    );

    const menu = await openMenu(DAY_WITH_ONE_OWN_AND_ONE_FOREIGN);
    await user.click(within(menu).getByRole('menuitem', { name: 'Eliminar evento' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'LAN en casa de Ana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar evento' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No tienes permiso para esta acción',
    );
  });
});
