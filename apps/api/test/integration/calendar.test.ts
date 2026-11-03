/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import {
  CalendarEntrySchema,
  CalendarResponseSchema,
  EventTemplateSchema,
} from '@party-finder/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, createTestContext, loggedInClient } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

async function makeTemplate(client: Client, name = 'Plan') {
  const res = await client.post('/event-templates', {
    name,
    description: 'Descripción',
    type: 'PASEO',
  });
  return EventTemplateSchema.parse(res.json);
}

const DAY = '2031-06-10';

describe('GET /calendar', () => {
  it('is public, returns an empty list, and echoes the range', async () => {
    const anon = new Client(ctx, '10.40.0.1');
    const res = await anon.get('/calendar?from=2031-06-01&to=2031-06-30');
    expect(res.status).toBe(200);
    expect(CalendarResponseSchema.parse(res.json)).toEqual({
      from: '2031-06-01',
      to: '2031-06-30',
      entries: [],
    });
  });

  it('validates the range: format, order, max 42 days (400)', async () => {
    const anon = new Client(ctx, '10.40.0.2');
    for (const q of [
      '',
      '?from=2031-06-01',
      '?from=2031-06-01&to=2031-02-30',
      '?from=junio&to=julio',
      '?from=2031-06-10&to=2031-06-09',
      '?from=2031-06-01&to=2031-07-13', // 43 days
    ]) {
      const res = await anon.get(`/calendar${q}`);
      expect(res.status, q).toBe(400);
      expect(res.json).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect((await anon.get('/calendar?from=2031-06-01&to=2031-07-12')).status).toBe(200); // exactly 42
    expect((await anon.get('/calendar?from=2031-06-01&to=2031-06-01')).status).toBe(200); // 1 day
  });

  it('returns entries ordered by date then creation, with attendees and per-user flags', async () => {
    const ana = await loggedInClient(ctx, '10.40.0.3', { username: 'ana' });
    const bruno = await loggedInClient(ctx, '10.40.0.4', { username: 'bruno' });
    const tpl = await makeTemplate(ana.client);
    const later = await ana.client.post('/calendar/entries', {
      templateId: tpl.id,
      date: '2031-06-12',
      capacity: 4,
    });
    const first = await bruno.client.post('/calendar/entries', {
      templateId: tpl.id,
      date: '2031-06-11',
      capacity: 2,
    });
    const second = await ana.client.post('/calendar/entries', {
      templateId: tpl.id,
      date: '2031-06-11',
      capacity: 3,
    });
    const firstId = (first.json as { id: string }).id;
    await bruno.client.post(`/calendar/entries/${firstId}/attendance`);
    await ana.client.post(`/calendar/entries/${firstId}/attendance`);
    const outside = await ana.client.post('/calendar/entries', {
      templateId: tpl.id,
      date: '2031-07-30',
      capacity: 3,
    });
    expect([later, first, second, outside].every((r) => r.status === 201)).toBe(true);

    const asAna = CalendarResponseSchema.parse(
      (await ana.client.get('/calendar?from=2031-06-01&to=2031-06-30')).json,
    );
    expect(asAna.entries.map((e) => e.date)).toEqual(['2031-06-11', '2031-06-11', '2031-06-12']);
    const [e1, e2, e3] = asAna.entries;
    expect(e1!.id).toBe(firstId);
    expect(e1).toMatchObject({
      attendeeCount: 2,
      capacity: 2,
      isAttending: true,
      canDelete: false,
    });
    expect(e1!.attendees.map((a) => a.username)).toEqual(['bruno', 'ana']); // sign-up order
    expect(e1!.addedBy.username).toBe('bruno');
    expect(e1!.template.id).toBe(tpl.id);
    expect(e2).toMatchObject({ attendeeCount: 0, isAttending: false, canDelete: true });
    expect(e3).toMatchObject({ canDelete: true });

    const asBruno = CalendarResponseSchema.parse(
      (await bruno.client.get('/calendar?from=2031-06-01&to=2031-06-30')).json,
    );
    expect(asBruno.entries[0]).toMatchObject({ isAttending: true, canDelete: true });
    expect(asBruno.entries[1]).toMatchObject({ isAttending: false, canDelete: false });

    const anon = new Client(ctx, '10.40.0.5');
    const asAnon = CalendarResponseSchema.parse(
      (await anon.get('/calendar?from=2031-06-01&to=2031-06-30')).json,
    );
    expect(asAnon.entries).toHaveLength(3);
    expect(asAnon.entries.every((e) => !e.isAttending && !e.canDelete)).toBe(true);
  });

  it('reflects template edits in the entries (same template, current state)', async () => {
    const { client } = await loggedInClient(ctx, '10.40.0.6');
    const tpl = await makeTemplate(client, 'Original');
    await client.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 3 });
    await client.patch(`/event-templates/${tpl.id}`, { name: 'Renombrada' });
    const cal = CalendarResponseSchema.parse(
      (await client.get(`/calendar?from=${DAY}&to=${DAY}`)).json,
    );
    expect(cal.entries[0]!.template.name).toBe('Renombrada');
  });
});

describe('POST /calendar/entries', () => {
  it('creates an entry (201) for the caller', async () => {
    const { client, user } = await loggedInClient(ctx, '10.41.0.1');
    const tpl = await makeTemplate(client);
    const res = await client.post('/calendar/entries', {
      templateId: tpl.id,
      date: DAY,
      capacity: 5,
    });
    expect(res.status).toBe(201);
    const entry = CalendarEntrySchema.parse(res.json);
    expect(entry).toMatchObject({
      date: DAY,
      capacity: 5,
      attendeeCount: 0,
      attendees: [],
      isAttending: false,
      canDelete: true,
    });
    expect(entry.addedBy.id).toBe(user.id);
  });

  it('any user can place any template (not only their own)', async () => {
    const owner = await loggedInClient(ctx, '10.41.0.2');
    const other = await loggedInClient(ctx, '10.41.0.3');
    const tpl = await makeTemplate(owner.client);
    expect(
      (await other.client.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 2 }))
        .status,
    ).toBe(201);
  });

  it('allows at most 4 entries per date and answers 409 DAY_FULL for the 5th', async () => {
    const { client } = await loggedInClient(ctx, '10.41.0.4');
    const tpl = await makeTemplate(client);
    for (let i = 0; i < 4; i++) {
      expect(
        (await client.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 3 }))
          .status,
      ).toBe(201);
    }
    const fifth = await client.post('/calendar/entries', {
      templateId: tpl.id,
      date: DAY,
      capacity: 3,
    });
    expect(fifth.status).toBe(409);
    expect(fifth.json).toEqual({ code: 'DAY_FULL', message: 'Este día ya tiene 4 eventos' });
    // another day is unaffected
    expect(
      (
        await client.post('/calendar/entries', {
          templateId: tpl.id,
          date: '2031-06-11',
          capacity: 3,
        })
      ).status,
    ).toBe(201);
    expect(await ctx.prisma.calendarEntry.count()).toBe(5);
  });

  it('validates the body (400): capacity 1-10, date, uuid, unknown fields', async () => {
    const { client } = await loggedInClient(ctx, '10.41.0.5');
    const tpl = await makeTemplate(client);
    const cases = [
      { templateId: tpl.id, date: DAY, capacity: 0 },
      { templateId: tpl.id, date: DAY, capacity: 11 },
      { templateId: tpl.id, date: DAY, capacity: 2.5 },
      { templateId: tpl.id, date: '2031-02-30', capacity: 3 },
      { templateId: 'nope', date: DAY, capacity: 3 },
      { templateId: tpl.id, date: DAY },
      { templateId: tpl.id, date: DAY, capacity: 3, addedBy: 'x' },
    ];
    for (const body of cases) {
      expect((await client.post('/calendar/entries', body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('404 NOT_FOUND for an unknown template', async () => {
    const { client } = await loggedInClient(ctx, '10.41.0.6');
    const res = await client.post('/calendar/entries', {
      templateId: '00000000-0000-4000-8000-000000000000',
      date: DAY,
      capacity: 3,
    });
    expect(res.status).toBe(404);
    expect(res.json).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('401 without a session and 403 without CSRF', async () => {
    const { client } = await loggedInClient(ctx, '10.41.0.7');
    const tpl = await makeTemplate(client);
    const anon = new Client(ctx, '10.41.0.8');
    await anon.fetchCsrf();
    expect(
      (await anon.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 3 })).status,
    ).toBe(401);
    expect(
      (
        await client.post(
          '/calendar/entries',
          { templateId: tpl.id, date: DAY, capacity: 3 },
          { noCsrf: true },
        )
      ).status,
    ).toBe(403);
  });
});

describe('DELETE /calendar/entries/:id', () => {
  it('only the user who added the entry may remove it (204), others get 403', async () => {
    const adder = await loggedInClient(ctx, '10.42.0.1');
    const other = await loggedInClient(ctx, '10.42.0.2');
    const tpl = await makeTemplate(adder.client);
    const entry = CalendarEntrySchema.parse(
      (await adder.client.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 3 }))
        .json,
    );

    const denied = await other.client.delete(`/calendar/entries/${entry.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json).toEqual({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para esta acción',
    });
    // the template owner is not special either
    expect(await ctx.prisma.calendarEntry.count()).toBe(1);

    expect((await adder.client.delete(`/calendar/entries/${entry.id}`)).status).toBe(204);
    expect(await ctx.prisma.calendarEntry.count()).toBe(0);
    expect((await adder.client.delete(`/calendar/entries/${entry.id}`)).status).toBe(404);
  });

  it('removes the attendances with the entry', async () => {
    const adder = await loggedInClient(ctx, '10.42.0.3');
    const guest = await loggedInClient(ctx, '10.42.0.4');
    const tpl = await makeTemplate(adder.client);
    const entry = CalendarEntrySchema.parse(
      (await adder.client.post('/calendar/entries', { templateId: tpl.id, date: DAY, capacity: 3 }))
        .json,
    );
    await guest.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect(await ctx.prisma.attendance.count()).toBe(1);
    await adder.client.delete(`/calendar/entries/${entry.id}`);
    expect(await ctx.prisma.attendance.count()).toBe(0);
  });

  it('400 for a bad id, 404 for an unknown id, 401 anonymous, 403 without CSRF', async () => {
    const { client } = await loggedInClient(ctx, '10.42.0.5');
    expect((await client.delete('/calendar/entries/not-a-uuid')).status).toBe(400);
    expect(
      (await client.delete('/calendar/entries/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
    const anon = new Client(ctx, '10.42.0.6');
    await anon.fetchCsrf();
    expect(
      (await anon.delete('/calendar/entries/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(401);
    expect(
      (
        await client.delete('/calendar/entries/00000000-0000-4000-8000-000000000000', {
          noCsrf: true,
        })
      ).status,
    ).toBe(403);
  });
});
