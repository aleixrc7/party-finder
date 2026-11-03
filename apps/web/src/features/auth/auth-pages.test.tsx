import { AUTH_MESSAGES, CSRF_HEADER, ErrorCode, endpoints } from '@party-finder/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '@/lib/api/client';
import { server } from '@/mocks/server';
import { MOCK_PASSWORD, mockState } from '@/mocks/state';
import { renderApp } from '@/test/render';

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => (
    <button type="button" onClick={() => onTokenChange('captcha-ok')}>
      Completar CAPTCHA
    </button>
  ),
}));

const url = (path: string) => `${API_BASE_URL}${path}`;
const rateLimited = () =>
  HttpResponse.json(
    { code: ErrorCode.RATE_LIMITED, message: 'Demasiados intentos, prueba más tarde' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );

async function submitLogin(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/Nombre de usuario/), username);
  await user.type(screen.getByLabelText(/Contraseña/), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  return user;
}

describe('login', () => {
  it('logs in and shows the username', async () => {
    renderApp('/identificarse');

    await submitLogin('ana', MOCK_PASSWORD);

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('validates required fields in Spanish before calling the API', async () => {
    const user = userEvent.setup();
    renderApp('/identificarse');

    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Introduce tu nombre de usuario')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu contraseña')).toBeInTheDocument();
  });

  it('shows the generic message verbatim on wrong credentials, without offering a resend', async () => {
    renderApp('/identificarse');

    await submitLogin('ana', 'contraseña-mala');

    expect(await screen.findByRole('alert')).toHaveTextContent(AUTH_MESSAGES.INVALID_CREDENTIALS);
    expect(
      screen.queryByRole('button', { name: 'Reenviar correo de verificación' }),
    ).not.toBeInTheDocument();
  });

  it('offers to resend, asking for the email, when the account is not verified', async () => {
    renderApp('/identificarse');

    const user = await submitLogin('dani', MOCK_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    await user.type(screen.getByLabelText(/Correo electrónico/), 'Dani@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Reenviar correo de verificación' }));

    expect(await screen.findByText(AUTH_MESSAGES.VERIFICATION_EMAIL_SENT)).toBeInTheDocument();
  });

  it('handles the login rate limit', async () => {
    server.use(http.post(url(endpoints.login.path), rateLimited));
    renderApp('/identificarse');

    await submitLogin('ana', MOCK_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos, prueba más tarde (espera 1 min)',
    );
  });

  it('asks for a new CSRF token after logging in', async () => {
    let csrfRequests = 0;
    const seen: (string | null)[] = [];
    server.use(
      http.get(url(endpoints.getCsrfToken.path), () => {
        csrfRequests += 1;
        return HttpResponse.json({ token: mockState.csrfToken });
      }),
      http.post(url(endpoints.logout.path), ({ request }) => {
        seen.push(request.headers.get(CSRF_HEADER));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/identificarse');

    const user = await submitLogin('ana', MOCK_PASSWORD);
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(seen).toEqual([mockState.csrfToken]));
    expect(csrfRequests).toBe(2);
  });

  it('redirects a user who already has a session', async () => {
    renderApp('/identificarse', 'ana');

    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });
});

describe('sign-up', () => {
  async function fillRegister(username = 'nueva') {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nombre de usuario/), username);
    await user.type(screen.getByLabelText(/Correo electrónico/), 'nueva@example.com');
    await user.type(screen.getByLabelText(/Contraseña/), 'una-contraseña-larga');
    return user;
  }

  it('requires completing the CAPTCHA', async () => {
    renderApp('/registro');
    const user = await fillRegister();

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Completa el CAPTCHA')).toBeInTheDocument();
    expect(mockState.users.some(({ username }) => username === 'nueva')).toBe(false);
  });

  it('shows the Check your email screen with the generic message and a resend', async () => {
    renderApp('/registro');
    const user = await fillRegister();

    await user.click(screen.getByRole('button', { name: 'Completar CAPTCHA' }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByText(AUTH_MESSAGES.VERIFICATION_EMAIL_SENT)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue('nueva@example.com');
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('marks a taken username and asks for the CAPTCHA again', async () => {
    renderApp('/registro');
    const user = await fillRegister('ana');

    await user.click(screen.getByRole('button', { name: 'Completar CAPTCHA' }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ese nombre de usuario ya está en uso')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Completa el CAPTCHA')).toBeInTheDocument();
  });

  it('shows the error when the server rejects the CAPTCHA', async () => {
    server.use(
      http.post(url(endpoints.register.path), () =>
        HttpResponse.json(
          { code: ErrorCode.CAPTCHA_FAILED, message: 'No se pudo verificar el CAPTCHA' },
          { status: 400 },
        ),
      ),
    );
    renderApp('/registro');
    const user = await fillRegister();

    await user.click(screen.getByRole('button', { name: 'Completar CAPTCHA' }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar el CAPTCHA');
  });

  it('places server validation issues on their fields', async () => {
    server.use(
      http.post(url(endpoints.register.path), () =>
        HttpResponse.json(
          {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Datos no válidos',
            details: { issues: [{ path: ['email'], message: 'Correo electrónico no válido' }] },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp('/registro');
    const user = await fillRegister();

    await user.click(screen.getByRole('button', { name: 'Completar CAPTCHA' }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Correo electrónico no válido')).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates the fields with the shared schemas', async () => {
    const user = userEvent.setup();
    renderApp('/registro');

    await user.type(await screen.findByLabelText(/Nombre de usuario/), 'ab');
    await user.type(screen.getByLabelText(/Correo electrónico/), 'no-es-correo');
    await user.type(screen.getByLabelText(/Contraseña/), 'corta');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Mínimo 3 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Correo electrónico no válido')).toBeInTheDocument();
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
  });
});

describe('/verificar-email', () => {
  it('posts the token only once under StrictMode and links to Identificarse', async () => {
    const posted: unknown[] = [];
    server.use(
      http.post(url(endpoints.verifyEmail.path), async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ message: AUTH_MESSAGES.EMAIL_VERIFIED });
      }),
    );
    renderApp('/verificar-email?token=token-de-un-solo-uso');

    expect(await screen.findByText(AUTH_MESSAGES.EMAIL_VERIFIED)).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Identificarse' }),
    ).toHaveAttribute('href', '/identificarse');
    expect(posted).toEqual([{ token: 'token-de-un-solo-uso' }]);
  });

  it('verifies a real single-use token', async () => {
    renderApp('/verificar-email?token=mock-token-dani');

    expect(await screen.findByRole('heading', { name: 'Cuenta verificada' })).toBeInTheDocument();
    expect(mockState.users.find(({ username }) => username === 'dani')?.verified).toBe(true);
  });

  it('shows link expired with a resend for an invalid token', async () => {
    const user = userEvent.setup();
    renderApp('/verificar-email?token=caducado');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
    );
    await user.type(screen.getByLabelText(/Correo electrónico/), 'dani@example.com');
    await user.click(screen.getByRole('button', { name: 'Reenviar correo de verificación' }));

    expect(await screen.findByText(AUTH_MESSAGES.VERIFICATION_EMAIL_SENT)).toBeInTheDocument();
  });

  it('shows the rate limit on a resend', async () => {
    server.use(http.post(url(endpoints.resendVerification.path), rateLimited));
    const user = userEvent.setup();
    renderApp('/verificar-email?token=caducado');

    await user.type(await screen.findByLabelText(/Correo electrónico/), 'dani@example.com');
    await user.click(screen.getByRole('button', { name: 'Reenviar correo de verificación' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some(({ textContent }) =>
            textContent.includes('Demasiados intentos, prueba más tarde (espera 1 min)'),
          ),
      ).toBe(true),
    );
  });

  it('treats a missing token as an expired link without calling the API', async () => {
    const verify = vi.fn();
    server.use(
      http.post(url(endpoints.verifyEmail.path), () => {
        verify();
        return HttpResponse.json({ message: AUTH_MESSAGES.EMAIL_VERIFIED });
      }),
    );
    renderApp('/verificar-email');

    expect(await screen.findByRole('heading', { name: 'Enlace caducado' })).toBeInTheDocument();
    expect(verify).not.toHaveBeenCalled();
  });

  it('offers a retry when rate limited, since the token was not consumed', async () => {
    const user = userEvent.setup();
    server.use(http.post(url(endpoints.verifyEmail.path), rateLimited));
    renderApp('/verificar-email?token=mock-token-dani');

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Cuenta verificada' })).toBeInTheDocument();
  });

  it('sets the no-referrer policy while the page is open', async () => {
    renderApp('/verificar-email?token=mock-token-dani');

    await screen.findByRole('heading', { name: 'Cuenta verificada' });

    const policies = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="referrer"]')];
    expect(policies.at(-1)?.content).toBe('no-referrer');
  });

  it('restores a normal referrer policy when leaving the page', async () => {
    const user = userEvent.setup();
    renderApp('/verificar-email?token=mock-token-dani');

    await screen.findByRole('heading', { name: 'Cuenta verificada' });
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Identificarse' }));
    await screen.findByRole('heading', { name: 'Identificarse' });

    const policies = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="referrer"]')];
    expect(policies.map(({ content }) => content)).not.toContain('no-referrer');
  });
});
