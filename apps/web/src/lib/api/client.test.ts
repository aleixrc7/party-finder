import { CSRF_HEADER, ErrorCode, endpoints } from '@party-finder/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { mockState } from '@/mocks/state';
import { API_BASE_URL, callApi, resetCsrfToken } from './client';
import { ApiRequestError, errorMessage, fieldErrors } from './errors';

const resendBody = { email: 'ana@example.com' };

describe('callApi', () => {
  it('sends the CSRF token and cookies on data-modifying requests', async () => {
    let csrfHeader: string | null = null;
    let credentials: RequestCredentials | null = null;
    server.use(
      http.post(`${API_BASE_URL}${endpoints.resendVerification.path}`, ({ request }) => {
        csrfHeader = request.headers.get(CSRF_HEADER);
        credentials = request.credentials;
        return HttpResponse.json(
          { message: 'Si los datos son válidos, recibirás un correo electrónico.' },
          { status: 202 },
        );
      }),
    );

    await callApi(endpoints.resendVerification, { body: resendBody });

    expect(csrfHeader).toBe(mockState.csrfToken);
    expect(credentials).toBe('include');
  });

  it('asks for the CSRF token only once while it stays valid', async () => {
    let csrfRequests = 0;
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getCsrfToken.path}`, () => {
        csrfRequests += 1;
        return HttpResponse.json({ token: mockState.csrfToken });
      }),
    );

    await callApi(endpoints.resendVerification, { body: resendBody });
    await callApi(endpoints.resendVerification, { body: resendBody });

    expect(csrfRequests).toBe(1);
  });

  it('renews a rejected CSRF token and retries once', async () => {
    await callApi(endpoints.resendVerification, { body: resendBody });
    mockState.csrfToken = 'rotated-by-the-server';

    await expect(callApi(endpoints.resendVerification, { body: resendBody })).resolves.toEqual(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('asks for a fresh token after resetCsrfToken', async () => {
    let csrfRequests = 0;
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getCsrfToken.path}`, () => {
        csrfRequests += 1;
        return HttpResponse.json({ token: mockState.csrfToken });
      }),
    );

    await callApi(endpoints.resendVerification, { body: resendBody });
    resetCsrfToken();
    await callApi(endpoints.resendVerification, { body: resendBody });

    expect(csrfRequests).toBe(2);
  });

  it('turns the API error format into ApiRequestError', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getMe.path}`, () =>
        HttpResponse.json(
          { code: ErrorCode.RATE_LIMITED, message: 'Demasiados intentos, prueba más tarde' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );

    const error = await callApi(endpoints.getMe).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(errorMessage(error)).toBe('Demasiados intentos, prueba más tarde (espera 30 s)');
  });

  it('tolerates a response that is not the API error format', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getMe.path}`, () =>
        HttpResponse.text('Bad gateway', { status: 502 }),
      ),
    );

    const error = await callApi(endpoints.getMe).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 502, code: ErrorCode.INTERNAL_ERROR });
  });

  it('reports a network failure with a readable message', async () => {
    server.use(http.get(`${API_BASE_URL}${endpoints.getMe.path}`, () => HttpResponse.error()));

    const error = await callApi(endpoints.getMe).catch((caught: unknown) => caught);

    expect(errorMessage(error)).toBe('No se pudo conectar con el servidor. Inténtalo de nuevo.');
  });

  it('rejects a success response that breaks the contract', async () => {
    server.use(
      http.get(`${API_BASE_URL}${endpoints.getMe.path}`, () =>
        HttpResponse.json({ unexpected: true }),
      ),
    );

    await expect(callApi(endpoints.getMe)).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('fieldErrors', () => {
  it('extracts the issues of a VALIDATION_ERROR', () => {
    const error = new ApiRequestError({
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Datos no válidos',
      details: { issues: [{ path: ['capacity'], message: 'Máximo 10' }] },
    });

    expect(fieldErrors(error)).toEqual([{ field: 'capacity', message: 'Máximo 10' }]);
  });

  it('returns nothing for other errors', () => {
    expect(fieldErrors(new Error('boom'))).toEqual([]);
  });
});
