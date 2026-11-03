import { EVENT_TYPE_LABELS, EventType, type CalendarEntry } from '@party-finder/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { signInAs } from '@/mocks/state';
import { renderApp, renderWithProviders } from '@/test/render';
import { EventPanel } from './EventPanel';

const entry: CalendarEntry = {
  id: '20000000-0000-4000-8000-000000000099',
  date: '2026-10-20',
  capacity: 3,
  attendeeCount: 1,
  attendees: [{ id: '00000000-0000-4000-8000-000000000002', username: 'bruno' }],
  addedBy: { id: '00000000-0000-4000-8000-000000000001', username: 'ana' },
  createdAt: '2026-10-01T10:00:00.000Z',
  isAttending: false,
  canDelete: false,
  template: {
    id: '10000000-0000-4000-8000-000000000099',
    owner: { id: '00000000-0000-4000-8000-000000000001', username: 'ana' },
    name: 'Noche de juegos',
    description: 'Juegos de mesa en el local.',
    type: EventType.OTROS,
    imageUrl: 'http://localhost:9000/party-finder-images/foto.webp',
    attendees: 3,
    startTime: '19:00',
    endTime: '22:30',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
};

describe('EventPanel', () => {
  it('shows the default text when nothing is selected', () => {
    renderWithProviders(<EventPanel entry={null} />);

    expect(screen.getByText('No hay evento seleccionado')).toBeInTheDocument();
  });

  it('shows image, name, description, type, schedule, capacity and attendees', () => {
    renderWithProviders(<EventPanel entry={entry} />);

    expect(screen.getByRole('img', { name: 'Imagen de Noche de juegos' })).toHaveAttribute(
      'src',
      entry.template.imageUrl,
    );
    expect(screen.getByRole('heading', { name: 'Noche de juegos' })).toBeInTheDocument();
    expect(screen.getByText('Juegos de mesa en el local.')).toBeInTheDocument();
    expect(screen.getByText(EVENT_TYPE_LABELS.OTROS)).toBeInTheDocument();
    expect(screen.getByText('19:00 – 22:30')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 plazas ocupadas')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Asistentes' })).getByText('bruno'),
    ).toBeVisible();
  });

  it('tells when nobody has signed up and when there is no schedule', () => {
    renderWithProviders(
      <EventPanel
        entry={{
          ...entry,
          attendeeCount: 0,
          attendees: [],
          template: { ...entry.template, startTime: null, endTime: null, imageUrl: null },
        }}
      />,
    );

    expect(screen.getByText('Aún no hay nadie apuntado.')).toBeInTheDocument();
    expect(screen.getByText('Sin horario definido')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('has no attendance button without a session', async () => {
    renderWithProviders(<EventPanel entry={entry} />);

    expect(await screen.findByRole('link', { name: 'Identifícate' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Apuntarme to a user who is not attending', async () => {
    signInAs('carla');
    renderWithProviders(<EventPanel entry={entry} />);

    expect(await screen.findByRole('button', { name: 'Apuntarme' })).toBeEnabled();
  });

  it('offers Desapuntarme to an attendee, even when the event is full', async () => {
    signInAs('carla');
    renderWithProviders(
      <EventPanel entry={{ ...entry, capacity: 1, attendeeCount: 1, isAttending: true }} />,
    );

    expect(await screen.findByRole('button', { name: 'Desapuntarme' })).toBeEnabled();
  });

  it('shows a disabled Completo button when the event is full', async () => {
    signInAs('carla');
    renderWithProviders(<EventPanel entry={{ ...entry, capacity: 1, attendeeCount: 1 }} />);

    expect(await screen.findByRole('button', { name: 'Completo' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apuntarme' })).not.toBeInTheDocument();
  });

  it('shows the Full state to visitors too', () => {
    renderWithProviders(<EventPanel entry={{ ...entry, capacity: 1, attendeeCount: 1 }} />);

    expect(screen.getByText('Completo')).toBeInTheDocument();
  });
});

describe('selecting and signing up from the calendar', () => {
  async function openEntry(name: RegExp, day: string) {
    const cell = await screen.findByRole('gridcell', { name: new RegExp(day) });
    const button = await within(cell).findByRole('button', { name });
    await userEvent.click(button);
  }

  it('shows the clicked event in the panel', async () => {
    renderApp();

    await openEntry(/LAN en casa de Ana/, '10 de octubre');

    const panel = screen.getByRole('complementary', { name: 'Detalle del evento' });
    expect(within(panel).getByRole('heading', { name: 'LAN en casa de Ana' })).toBeInTheDocument();
    expect(screen.queryByText('No hay evento seleccionado')).not.toBeInTheDocument();
  });

  it('signs up and withdraws, updating the attendee list', async () => {
    const user = userEvent.setup();
    renderApp('/', 'carla');
    await openEntry(/LAN en casa de Ana/, '10 de octubre');
    const panel = screen.getByRole('complementary', { name: 'Detalle del evento' });

    await user.click(await within(panel).findByRole('button', { name: 'Apuntarme' }));
    await within(panel).findByRole('button', { name: 'Desapuntarme' });
    expect(within(panel).getByRole('list', { name: 'Asistentes' })).toHaveTextContent('carla');

    await user.click(within(panel).getByRole('button', { name: 'Desapuntarme' }));
    await within(panel).findByRole('button', { name: 'Apuntarme' });
    expect(within(panel).getByRole('list', { name: 'Asistentes' })).not.toHaveTextContent('carla');
  });

  it('switches to Full when someone else took the last place', async () => {
    const user = userEvent.setup();
    renderApp('/', 'ana');
    await openEntry(/LAN en casa de Ana/, '10 de octubre');
    const panel = screen.getByRole('complementary', { name: 'Detalle del evento' });
    const { mockState } = await import('@/mocks/state');
    const lan = mockState.entries.find(({ capacity }) => capacity === 5);
    if (lan) {
      lan.capacity = 1;
    }

    await user.click(await within(panel).findByRole('button', { name: 'Apuntarme' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent('El evento está completo');
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Completo' })).toBeDisabled(),
    );
  });
});
