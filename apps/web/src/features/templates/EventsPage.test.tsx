import { CSRF_HEADER, ErrorCode, MAX_IMAGE_BYTES, endpoints } from '@party-finder/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE_URL } from '@/lib/api/client';
import { server } from '@/mocks/server';
import { mockState } from '@/mocks/state';
import { renderApp } from '@/test/render';

const list = () => screen.findByRole('list', { name: 'Lista de eventos' });
const form = () => screen.getByRole('form', { name: /evento/ });

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(within(form()).getByLabelText(/Nombre/), 'Cena de grupo');
  await user.type(within(form()).getByLabelText(/Descripción/), 'Cenamos juntos.');
  await user.selectOptions(within(form()).getByLabelText(/Tipo/), 'Otros');
}

describe('template list', () => {
  it('shows edit and delete only on the templates of the current user', async () => {
    renderApp('/eventos', 'ana');

    await list();

    expect(screen.getByRole('button', { name: 'Editar LAN en casa de Ana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar LAN en casa de Ana' })).toBeInTheDocument();
    expect(screen.getByText('Campaña de D&D')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Campaña de D&D' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Eliminar Campaña de D&D' }),
    ).not.toBeInTheDocument();
  });

  it('shows the loading state', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.listEventTemplates.path}`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderApp('/eventos', 'ana');

    expect(await screen.findByText('Cargando eventos…')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockState.templates = [];
    mockState.entries = [];
    renderApp('/eventos', 'ana');

    expect(await screen.findByText('Todavía no hay eventos')).toBeInTheDocument();
  });

  it('shows the error state', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.listEventTemplates.path}`, () =>
        HttpResponse.json({ code: ErrorCode.FORBIDDEN, message: 'Sin permiso' }, { status: 403 }),
      ),
    );
    renderApp('/eventos', 'ana');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('paginates', async () => {
    const user = userEvent.setup();
    const pageSize = 2;
    server.use(
      http.get(`${API_BASE_URL}${endpoints.listEventTemplates.path}`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json({
          items: mockState.templates.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: mockState.templates.length,
          totalPages: 2,
        });
      }),
    );
    renderApp('/eventos', 'ana');
    await list();
    expect(screen.queryByText('Paseo por el parque')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Paseo por el parque')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });
});

describe('creating a template', () => {
  it('requires name, description and type', async () => {
    const user = userEvent.setup();
    renderApp('/eventos', 'ana');
    await list();

    await user.click(within(form()).getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La descripción es obligatoria')).toBeInTheDocument();
    expect(within(form()).getAllByText('Selecciona un tipo').length).toBeGreaterThan(1);
  });

  it('creates it and resets the form', async () => {
    const user = userEvent.setup();
    renderApp('/eventos', 'ana');
    await list();
    await fillRequiredFields(user);
    await user.selectOptions(within(form()).getByLabelText(/Asistentes/), '3');
    await user.type(within(form()).getByLabelText(/Hora de inicio/), '21:15');

    await user.click(within(form()).getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByRole('heading', { name: 'Cena de grupo' })).toBeInTheDocument();
    expect(mockState.templates[0]).toMatchObject({
      name: 'Cena de grupo',
      type: 'OTROS',
      attendees: 3,
      startTime: '21:15',
      endTime: null,
      imageUrl: null,
    });
    await waitFor(() => expect(within(form()).getByLabelText(/Nombre/)).toHaveValue(''));
  });

  it('uploads the image first and sends its URL, showing a preview with alt text', async () => {
    const user = userEvent.setup();
    let uploadCsrf: string | null = null;
    server.use(
      http.post(`${API_BASE_URL}${endpoints.uploadImage.path}`, ({ request }) => {
        uploadCsrf = request.headers.get(CSRF_HEADER);
        return HttpResponse.json(
          { url: 'http://localhost:9000/party-finder-images/nueva.webp' },
          { status: 201 },
        );
      }),
    );
    renderApp('/eventos', 'ana');
    await list();
    await fillRequiredFields(user);

    await user.upload(
      within(form()).getByLabelText(/Imagen/),
      new File(['png'], 'foto.png', { type: 'image/png' }),
    );

    expect(
      await screen.findByRole('img', { name: 'Vista previa de la imagen del evento' }),
    ).toHaveAttribute('src', 'http://localhost:9000/party-finder-images/nueva.webp');
    expect(uploadCsrf).toBe(mockState.csrfToken);

    await user.click(within(form()).getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByRole('img', { name: 'Imagen de Cena de grupo' })).toBeInTheDocument();
    expect(mockState.templates[0]?.imageUrl).toBe(
      'http://localhost:9000/party-finder-images/nueva.webp',
    );
  });

  it('rejects files of the wrong type or too large without uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    let uploads = 0;
    server.use(
      http.post(`${API_BASE_URL}${endpoints.uploadImage.path}`, () => {
        uploads += 1;
        return HttpResponse.json({ url: 'http://localhost:9000/x.webp' }, { status: 201 });
      }),
    );
    renderApp('/eventos', 'ana');
    await list();
    const input = within(form()).getByLabelText(/Imagen/);

    await user.upload(input, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
    expect(
      await screen.findByText('Solo se admiten imágenes JPEG, PNG o WebP.'),
    ).toBeInTheDocument();

    await user.upload(
      input,
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'big.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('La imagen no puede superar los 5 MB.')).toBeInTheDocument();
    expect(uploads).toBe(0);
  });

  it('shows the error of a failed upload', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE_URL}${endpoints.uploadImage.path}`, () =>
        HttpResponse.json(
          { code: ErrorCode.UNSUPPORTED_MEDIA_TYPE, message: 'Formato de imagen no admitido' },
          { status: 415 },
        ),
      ),
    );
    renderApp('/eventos', 'ana');
    await list();

    await user.upload(
      within(form()).getByLabelText(/Imagen/),
      new File(['fake'], 'foto.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato de imagen no admitido');
  });
});

describe('editing a template', () => {
  it('fills the form and sends only the changed fields', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    const original = http.patch(`${API_BASE_URL}/event-templates/:id`, async ({ request }) => {
      sent = await request.clone().json();
    });
    server.use(original);
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Editar LAN en casa de Ana' }));

    const nameInput = within(form()).getByLabelText(/Nombre/);
    expect(nameInput).toHaveValue('LAN en casa de Ana');
    expect(within(form()).getByLabelText(/Asistentes/)).toHaveValue('6');
    await user.clear(nameInput);
    await user.type(nameInput, 'LAN renovada');
    await user.click(within(form()).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('heading', { name: 'LAN renovada' })).toBeInTheDocument();
    expect(sent).toEqual({ name: 'LAN renovada' });
    expect(within(form()).getByRole('heading', { name: 'Crear evento' })).toBeInTheDocument();
  });

  it('clears an optional field by sending null', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(
      http.patch(`${API_BASE_URL}/event-templates/:id`, async ({ request }) => {
        sent = await request.clone().json();
      }),
    );
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Editar LAN en casa de Ana' }));
    await user.clear(within(form()).getByLabelText(/Hora de fin/));
    await user.click(within(form()).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(sent).toEqual({ endTime: null }));
  });

  it('does not call the API when nothing changed', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.patch(`${API_BASE_URL}/event-templates/:id`, () => {
        calls += 1;
      }),
    );
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Editar LAN en casa de Ana' }));
    await user.click(within(form()).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await within(form()).findByRole('heading', { name: 'Crear evento' }),
    ).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('can be cancelled', async () => {
    const user = userEvent.setup();
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Editar LAN en casa de Ana' }));
    await user.click(within(form()).getByRole('button', { name: 'Cancelar' }));

    expect(within(form()).getByLabelText(/Nombre/)).toHaveValue('');
  });
});

describe('deleting a template', () => {
  it('asks for confirmation and removes it', async () => {
    const user = userEvent.setup();
    mockState.entries = [];
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Eliminar LAN en casa de Ana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar evento' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('LAN en casa de Ana')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains when the template is in use', async () => {
    const user = userEvent.setup();
    renderApp('/eventos', 'ana');
    await list();

    await user.click(screen.getByRole('button', { name: 'Eliminar LAN en casa de Ana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar evento' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'La plantilla está en uso en el calendario',
    );
  });
});

describe('expired session', () => {
  it('sends the user to Identificarse when the API answers 401', async () => {
    renderApp('/eventos', 'ana');
    await list();
    const user = userEvent.setup();
    mockState.currentUserId = null;

    await user.click(screen.getByRole('button', { name: 'Eliminar LAN en casa de Ana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar evento' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('heading', { name: 'Identificarse' })).toBeInTheDocument();
  });
});
