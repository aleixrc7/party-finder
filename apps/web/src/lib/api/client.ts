import {
  ApiErrorSchema,
  CSRF_HEADER,
  ErrorCode,
  endpoints,
  type EndpointDef,
} from '@party-finder/shared';
import type { z } from 'zod';
import { ApiRequestError, hasErrorCode, networkError, unexpectedError } from './errors';

export const API_BASE_URL = new URL(
  import.meta.env.VITE_API_URL ?? '/api',
  window.location.origin,
).href.replace(/\/+$/, '');

type ResponseOf<E extends EndpointDef> =
  E['success']['schema'] extends z.ZodType<infer Output> ? Output : undefined;

type BodyOf<E extends EndpointDef> = E extends { body: z.ZodType } ? z.input<E['body']> : never;

interface CallOptions<E extends EndpointDef> {
  id?: string;
  query?: Record<string, string | number>;
  body?: BodyOf<E>;
  formData?: FormData;
}

let csrfTokenRequest: Promise<string> | null = null;

export function resetCsrfToken() {
  csrfTokenRequest = null;
}

function getCsrfToken() {
  if (!csrfTokenRequest) {
    const request = callApi(endpoints.getCsrfToken).then(({ token }) => token);
    request.catch(() => {
      if (csrfTokenRequest === request) {
        resetCsrfToken();
      }
    });
    csrfTokenRequest = request;
  }
  return csrfTokenRequest;
}

function buildUrl(path: string, id?: string, query?: CallOptions<EndpointDef>['query']) {
  const resolvedPath = id === undefined ? path : path.replace('{id}', encodeURIComponent(id));
  const search = query
    ? `?${new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)]),
      ).toString()}`
    : '';
  return `${API_BASE_URL}${resolvedPath}${search}`;
}

async function send<E extends EndpointDef>(endpoint: E, options: CallOptions<E>) {
  const headers = new Headers({ Accept: 'application/json' });
  if (endpoint.csrf) {
    headers.set(CSRF_HEADER, await getCsrfToken());
  }
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  try {
    return await fetch(buildUrl(endpoint.path, options.id, options.query), {
      method: endpoint.method,
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw networkError();
  }
}

async function toRequestError(response: Response) {
  const payload = ApiErrorSchema.safeParse(await response.json().catch(() => null));
  if (!payload.success) {
    return unexpectedError(response.status);
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiRequestError({
    status: response.status,
    code: payload.data.code,
    message: payload.data.message,
    details: payload.data.details,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}

async function sendRenewingCsrf<E extends EndpointDef>(endpoint: E, options: CallOptions<E>) {
  const response = await send(endpoint, options);
  if (response.ok) {
    return response;
  }
  const error = await toRequestError(response);
  if (!endpoint.csrf || !hasErrorCode(error, ErrorCode.CSRF_INVALID)) {
    throw error;
  }
  resetCsrfToken();
  const retried = await send(endpoint, options);
  if (!retried.ok) {
    throw await toRequestError(retried);
  }
  return retried;
}

export async function callApi<E extends EndpointDef>(
  endpoint: E,
  options: CallOptions<E> = {},
): Promise<ResponseOf<E>> {
  const response = await sendRenewingCsrf(endpoint, options);
  const schema = endpoint.success.schema;
  if (schema === null) {
    return undefined as ResponseOf<E>;
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw unexpectedError(response.status);
  }
  return parsed.data as ResponseOf<E>;
}
