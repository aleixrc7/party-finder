import {
  ALLOWED_IMAGE_MIME_TYPES,
  AUTH_MESSAGES,
  CSRF_HEADER,
  CalendarQuerySchema,
  CreateCalendarEntryRequestSchema,
  CreateEventTemplateRequestSchema,
  ErrorCode,
  LoginRequestSchema,
  MAX_EVENTS_PER_DAY,
  MAX_IMAGE_BYTES,
  PaginationQuerySchema,
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  UPLOAD_IMAGE_FIELD,
  UpdateEventTemplateRequestSchema,
  VerifyEmailRequestSchema,
  endpoints,
  toValidationErrorDetails,
  type ApiError,
  type CalendarEntry,
  type EventTemplate,
  type UserSummary,
} from '@party-finder/shared';
import { http, HttpResponse, type DefaultBodyType, type HttpResponseResolver } from 'msw';
import type { z } from 'zod';
import { API_BASE_URL } from '@/lib/api/client';
import { currentUser, mockState, type MockEntry } from './state';

export const mockImagesPath = '/mock-images';

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.replace('{id}', ':id')}`;
}

function errorResponse(status: number, code: string, message: string, details?: unknown) {
  const body: ApiError = { code, message, details };
  return HttpResponse.json(body, { status });
}

const unauthenticated = () => errorResponse(401, ErrorCode.UNAUTHENTICATED, 'Debes iniciar sesión');
const forbidden = () =>
  errorResponse(403, ErrorCode.FORBIDDEN, 'No tienes permiso para esta acción');
const notFound = () => errorResponse(404, ErrorCode.NOT_FOUND, 'No encontrado');

function hasValidCsrf(request: Request) {
  return request.headers.get(CSRF_HEADER) === mockState.csrfToken;
}

function csrfInvalid() {
  return errorResponse(403, ErrorCode.CSRF_INVALID, 'Token CSRF no válido');
}

function rotateCsrf() {
  mockState.csrfToken = `mock-csrf-${crypto.randomUUID()}`;
}

async function parseBody<S extends z.ZodType>(request: Request, schema: S) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) {
    return { data: parsed.data as z.output<S> };
  }
  return {
    failure: errorResponse(
      400,
      ErrorCode.VALIDATION_ERROR,
      'Datos no válidos',
      toValidationErrorDetails(parsed.error),
    ),
  };
}

function summary(user: UserSummary): UserSummary {
  return { id: user.id, username: user.username };
}

function findUser(id: string) {
  const user = mockState.users.find((candidate) => candidate.id === id);
  if (!user) {
    throw new Error(`Unknown mock user ${id}`);
  }
  return user;
}

function findTemplate(id: string) {
  const template = mockState.templates.find((candidate) => candidate.id === id);
  if (!template) {
    throw new Error(`Unknown mock template ${id}`);
  }
  return template;
}

function serializeEntry(entry: MockEntry): CalendarEntry {
  const viewerId = mockState.currentUserId;
  return {
    id: entry.id,
    date: entry.date,
    capacity: entry.capacity,
    attendeeCount: entry.attendeeIds.length,
    attendees: entry.attendeeIds.map((id) => summary(findUser(id))),
    addedBy: summary(findUser(entry.addedById)),
    template: findTemplate(entry.templateId),
    createdAt: entry.createdAt,
    isAttending: viewerId !== null && entry.attendeeIds.includes(viewerId),
    canDelete: viewerId === entry.addedById,
  };
}

function protectedRoute(
  resolver: HttpResponseResolver<{ id: string }, DefaultBodyType>,
): HttpResponseResolver<{ id: string }, DefaultBodyType> {
  return (info) => {
    if (!hasValidCsrf(info.request)) {
      return csrfInvalid();
    }
    if (!currentUser()) {
      return unauthenticated();
    }
    return resolver(info);
  };
}

export const handlers = [
  http.get(apiUrl(endpoints.getCsrfToken.path), () =>
    HttpResponse.json({ token: mockState.csrfToken }),
  ),

  http.get(apiUrl(endpoints.getMe.path), () => {
    const user = currentUser();
    return HttpResponse.json({ user: user ? summary(user) : null });
  }),

  http.post(apiUrl(endpoints.login.path), async ({ request }) => {
    if (!hasValidCsrf(request)) {
      return csrfInvalid();
    }
    const { data, failure } = await parseBody(request, LoginRequestSchema);
    if (!data) {
      return failure;
    }
    const user = mockState.users.find(({ username }) => username === data.username);
    if (!user || user.password !== data.password) {
      return errorResponse(401, ErrorCode.INVALID_CREDENTIALS, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }
    if (!user.verified) {
      return errorResponse(403, ErrorCode.EMAIL_NOT_VERIFIED, AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    }
    mockState.currentUserId = user.id;
    rotateCsrf();
    return HttpResponse.json({ user: summary(user) });
  }),

  http.post(
    apiUrl(endpoints.logout.path),
    protectedRoute(() => {
      mockState.currentUserId = null;
      rotateCsrf();
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.post(apiUrl(endpoints.register.path), async ({ request }) => {
    if (!hasValidCsrf(request)) {
      return csrfInvalid();
    }
    const { data, failure } = await parseBody(request, RegisterRequestSchema);
    if (!data) {
      return failure;
    }
    const usernameTaken = mockState.users.some(
      ({ username }) => username.toLowerCase() === data.username.toLowerCase(),
    );
    if (usernameTaken) {
      return errorResponse(409, ErrorCode.USERNAME_TAKEN, 'Ese nombre de usuario ya está en uso');
    }
    if (!mockState.users.some(({ email }) => email === data.email)) {
      const id = crypto.randomUUID();
      const token = `mock-token-${data.username}`;
      mockState.users.push({
        id,
        username: data.username,
        email: data.email,
        password: data.password,
        verified: false,
      });
      mockState.verificationTokens.set(token, id);
      console.info(`[mocks] Enlace de verificación: /verificar-email?token=${token}`);
    }
    return HttpResponse.json({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT }, { status: 202 });
  }),

  http.post(apiUrl(endpoints.verifyEmail.path), async ({ request }) => {
    if (!hasValidCsrf(request)) {
      return csrfInvalid();
    }
    const { data, failure } = await parseBody(request, VerifyEmailRequestSchema);
    if (!data) {
      return failure;
    }
    const userId = mockState.verificationTokens.get(data.token);
    if (!userId) {
      return errorResponse(
        400,
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
      );
    }
    mockState.verificationTokens.delete(data.token);
    findUser(userId).verified = true;
    return HttpResponse.json({ message: AUTH_MESSAGES.EMAIL_VERIFIED });
  }),

  http.post(apiUrl(endpoints.resendVerification.path), async ({ request }) => {
    if (!hasValidCsrf(request)) {
      return csrfInvalid();
    }
    const { data, failure } = await parseBody(request, ResendVerificationRequestSchema);
    if (!data) {
      return failure;
    }
    return HttpResponse.json({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT }, { status: 202 });
  }),

  http.get(apiUrl(endpoints.listEventTemplates.path), ({ request }) => {
    if (!currentUser()) {
      return unauthenticated();
    }
    const url = new URL(request.url);
    const { page, pageSize } = PaginationQuerySchema.parse({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    const total = mockState.templates.length;
    return HttpResponse.json({
      items: mockState.templates.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  }),

  http.post(
    apiUrl(endpoints.createEventTemplate.path),
    protectedRoute(async ({ request }) => {
      const { data, failure } = await parseBody(request, CreateEventTemplateRequestSchema);
      if (!data) {
        return failure;
      }
      const owner = currentUser();
      if (!owner) {
        return unauthenticated();
      }
      const now = new Date().toISOString();
      const template: EventTemplate = {
        id: crypto.randomUUID(),
        owner: summary(owner),
        name: data.name,
        description: data.description,
        type: data.type,
        imageUrl: data.imageUrl ?? null,
        attendees: data.attendees ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        createdAt: now,
        updatedAt: now,
      };
      mockState.templates.unshift(template);
      return HttpResponse.json(template, { status: 201 });
    }),
  ),

  http.patch(
    apiUrl(endpoints.updateEventTemplate.path),
    protectedRoute(async ({ request, params }) => {
      const template = mockState.templates.find(({ id }) => id === params.id);
      if (!template) {
        return notFound();
      }
      if (template.owner.id !== mockState.currentUserId) {
        return forbidden();
      }
      const { data, failure } = await parseBody(request, UpdateEventTemplateRequestSchema);
      if (!data) {
        return failure;
      }
      Object.assign(template, data, { updatedAt: new Date().toISOString() });
      return HttpResponse.json(template);
    }),
  ),

  http.delete(
    apiUrl(endpoints.deleteEventTemplate.path),
    protectedRoute(({ params }) => {
      const template = mockState.templates.find(({ id }) => id === params.id);
      if (!template) {
        return notFound();
      }
      if (template.owner.id !== mockState.currentUserId) {
        return forbidden();
      }
      if (mockState.entries.some(({ templateId }) => templateId === template.id)) {
        return errorResponse(
          409,
          ErrorCode.TEMPLATE_IN_USE,
          'La plantilla está en uso en el calendario',
        );
      }
      mockState.templates = mockState.templates.filter(({ id }) => id !== template.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.post(
    apiUrl(endpoints.uploadImage.path),
    protectedRoute(async ({ request }) => {
      const file = (await request.formData()).get(UPLOAD_IMAGE_FIELD);
      if (!(file instanceof File)) {
        return errorResponse(400, ErrorCode.VALIDATION_ERROR, 'Datos no válidos', { issues: [] });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return errorResponse(413, ErrorCode.PAYLOAD_TOO_LARGE, 'La imagen supera los 5 MB');
      }
      if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
        return errorResponse(
          415,
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          'Formato de imagen no admitido',
        );
      }
      const id = crypto.randomUUID();
      mockState.uploadedImages.set(id, {
        bytes: await file.arrayBuffer(),
        contentType: file.type,
      });
      return HttpResponse.json({ url: `${API_BASE_URL}${mockImagesPath}/${id}` }, { status: 201 });
    }),
  ),

  http.get(apiUrl(`${mockImagesPath}/{id}`), ({ params }) => {
    const image = mockState.uploadedImages.get(String(params.id));
    if (!image) {
      return notFound();
    }
    return new HttpResponse(image.bytes, { headers: { 'Content-Type': image.contentType } });
  }),

  http.get(apiUrl(endpoints.getCalendar.path), ({ request }) => {
    const url = new URL(request.url);
    const query = CalendarQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) {
      return errorResponse(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Datos no válidos',
        toValidationErrorDetails(query.error),
      );
    }
    const { from, to } = query.data;
    return HttpResponse.json({
      from,
      to,
      entries: mockState.entries
        .filter(({ date }) => date >= from && date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(serializeEntry),
    });
  }),

  http.post(
    apiUrl(endpoints.createCalendarEntry.path),
    protectedRoute(async ({ request }) => {
      const { data, failure } = await parseBody(request, CreateCalendarEntryRequestSchema);
      if (!data) {
        return failure;
      }
      if (!mockState.templates.some(({ id }) => id === data.templateId)) {
        return notFound();
      }
      const entriesOnDay = mockState.entries.filter(({ date }) => date === data.date).length;
      if (entriesOnDay >= MAX_EVENTS_PER_DAY) {
        return errorResponse(
          409,
          ErrorCode.DAY_FULL,
          `Este día ya tiene ${MAX_EVENTS_PER_DAY} eventos`,
        );
      }
      const entry: MockEntry = {
        id: crypto.randomUUID(),
        date: data.date,
        capacity: data.capacity,
        addedById: mockState.currentUserId ?? '',
        templateId: data.templateId,
        attendeeIds: [],
        createdAt: new Date().toISOString(),
      };
      mockState.entries.push(entry);
      return HttpResponse.json(serializeEntry(entry), { status: 201 });
    }),
  ),

  http.delete(
    apiUrl(endpoints.deleteCalendarEntry.path),
    protectedRoute(({ params }) => {
      const entry = mockState.entries.find(({ id }) => id === params.id);
      if (!entry) {
        return notFound();
      }
      if (entry.addedById !== mockState.currentUserId) {
        return forbidden();
      }
      mockState.entries = mockState.entries.filter(({ id }) => id !== entry.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.post(
    apiUrl(endpoints.attend.path),
    protectedRoute(({ params }) => {
      const entry = mockState.entries.find(({ id }) => id === params.id);
      const userId = mockState.currentUserId;
      if (!entry || !userId) {
        return notFound();
      }
      if (entry.attendeeIds.includes(userId)) {
        return errorResponse(409, ErrorCode.ALREADY_ATTENDING, 'Ya estás apuntado a este evento');
      }
      if (entry.attendeeIds.length >= entry.capacity) {
        return errorResponse(409, ErrorCode.ENTRY_FULL, 'El evento está completo');
      }
      entry.attendeeIds.push(userId);
      return HttpResponse.json(serializeEntry(entry), { status: 201 });
    }),
  ),

  http.delete(
    apiUrl(endpoints.unattend.path),
    protectedRoute(({ params }) => {
      const entry = mockState.entries.find(({ id }) => id === params.id);
      const userId = mockState.currentUserId;
      if (!entry || !userId || !entry.attendeeIds.includes(userId)) {
        return notFound();
      }
      entry.attendeeIds = entry.attendeeIds.filter((id) => id !== userId);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
