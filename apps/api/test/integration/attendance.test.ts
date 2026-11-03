/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { CalendarEntrySchema, EventTemplateSchema, MAX_EVENTS_PER_DAY } from '@party-finder/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, createTestContext, loggedInClient } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

async function setup(capacity: number) {
  const host = await loggedInClient(ctx, '10.50.0.1');
  const tpl = EventTemplateSchema.parse(
    (
      await host.client.post('/event-templates', {
        name: 'Plan',
        description: 'Desc',
        type: 'LAN_PARTY',
      })
    ).json,
  );
  const entry = CalendarEntrySchema.parse(
    (
      await host.client.post('/calendar/entries', {
        templateId: tpl.id,
        date: '2031-07-04',
        capacity,
      })
    ).json,
  );
  return { host, entry };
}

describe('attendance', () => {
  it('signs a user up (201) and returns the entry with the updated attendee list', async () => {
    const { entry } = await setup(3);
    const guest = await loggedInClient(ctx, '10.50.0.2', { username: 'invitada' });
    const res = await guest.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect(res.status).toBe(201);
    const updated = CalendarEntrySchema.parse(res.json);
    expect(updated).toMatchObject({
      id: entry.id,
      attendeeCount: 1,
      isAttending: true,
      canDelete: false,
    });
    expect(updated.attendees).toEqual([{ id: guest.user.id, username: 'invitada' }]);
  });

  it('409 ALREADY_ATTENDING when signing up twice', async () => {
    const { entry } = await setup(3);
    const guest = await loggedInClient(ctx, '10.50.0.3');
    await guest.client.post(`/calendar/entries/${entry.id}/attendance`);
    const again = await guest.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect(again.status).toBe(409);
    expect(again.json).toEqual({
      code: 'ALREADY_ATTENDING',
      message: 'Ya estás apuntado a este evento',
    });
    expect(await ctx.prisma.attendance.count()).toBe(1);
  });

  it('409 ENTRY_FULL once capacity is reached', async () => {
    const { entry } = await setup(2);
    const users = await Promise.all([2, 3, 4].map((n) => loggedInClient(ctx, `10.50.0.${n + 10}`)));
    expect((await users[0]!.client.post(`/calendar/entries/${entry.id}/attendance`)).status).toBe(
      201,
    );
    expect((await users[1]!.client.post(`/calendar/entries/${entry.id}/attendance`)).status).toBe(
      201,
    );
    const full = await users[2]!.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect(full.status).toBe(409);
    expect(full.json).toEqual({ code: 'ENTRY_FULL', message: 'El evento está completo' });
    // an attendee of a full entry sees ALREADY_ATTENDING, not "full"
    const dup = await users[0]!.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect(dup.json).toMatchObject({ code: 'ALREADY_ATTENDING' });
  });

  it('a withdrawal frees the place', async () => {
    const { entry } = await setup(1);
    const a = await loggedInClient(ctx, '10.50.0.20');
    const b = await loggedInClient(ctx, '10.50.0.21');
    await a.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect((await b.client.post(`/calendar/entries/${entry.id}/attendance`)).status).toBe(409);
    expect((await a.client.delete(`/calendar/entries/${entry.id}/attendance`)).status).toBe(204);
    expect((await b.client.post(`/calendar/entries/${entry.id}/attendance`)).status).toBe(201);
  });

  it('DELETE is 404 when not attending or the entry does not exist', async () => {
    const { entry } = await setup(2);
    const guest = await loggedInClient(ctx, '10.50.0.22');
    const notAttending = await guest.client.delete(`/calendar/entries/${entry.id}/attendance`);
    expect(notAttending.status).toBe(404);
    expect(notAttending.json).toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (
        await guest.client.delete(
          '/calendar/entries/00000000-0000-4000-8000-000000000000/attendance',
        )
      ).status,
    ).toBe(404);
  });

  it('a user can only withdraw themself (others keep their place)', async () => {
    const { entry } = await setup(3);
    const a = await loggedInClient(ctx, '10.50.0.23');
    const b = await loggedInClient(ctx, '10.50.0.24');
    await a.client.post(`/calendar/entries/${entry.id}/attendance`);
    expect((await b.client.delete(`/calendar/entries/${entry.id}/attendance`)).status).toBe(404);
    expect(await ctx.prisma.attendance.count()).toBe(1);
  });

  it('404 for an unknown entry, 400 for a bad id', async () => {
    const guest = await loggedInClient(ctx, '10.50.0.25');
    const unknown = await guest.client.post(
      '/calendar/entries/00000000-0000-4000-8000-000000000000/attendance',
    );
    expect(unknown.status).toBe(404);
    expect((await guest.client.post('/calendar/entries/xyz/attendance')).status).toBe(400);
  });

  it('401 without a session and 403 without CSRF', async () => {
    const { entry } = await setup(2);
    const anon = new Client(ctx, '10.50.0.26');
    await anon.fetchCsrf();
    expect((await anon.post(`/calendar/entries/${entry.id}/attendance`)).status).toBe(401);
    expect((await anon.delete(`/calendar/entries/${entry.id}/attendance`)).status).toBe(401);
    const guest = await loggedInClient(ctx, '10.50.0.27');
    expect(
      (
        await guest.client.post(`/calendar/entries/${entry.id}/attendance`, undefined, {
          noCsrf: true,
        })
      ).status,
    ).toBe(403);
  });
});

describe('concurrency', () => {
  it('20 simultaneous sign-ups on a capacity of 3 admit exactly 3', async () => {
    const { entry } = await setup(3);
    const users = await Promise.all(
      Array.from({ length: 20 }, (_, i) => loggedInClient(ctx, `10.51.${i}.1`)),
    );
    const results = await Promise.all(
      users.map((u) => u.client.post(`/calendar/entries/${entry.id}/attendance`)),
    );
    const ok = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(full).toHaveLength(17);
    expect(full.every((r) => (r.json as { code: string }).code === 'ENTRY_FULL')).toBe(true);
    expect(await ctx.prisma.attendance.count({ where: { entryId: entry.id } })).toBe(3);
  });

  it('the same user signing up 10 times at once gets exactly one place', async () => {
    const { entry } = await setup(5);
    const guest = await loggedInClient(ctx, '10.52.0.1');
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        guest.client.post(`/calendar/entries/${entry.id}/attendance`),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await ctx.prisma.attendance.count()).toBe(1);
  });

  it('10 simultaneous additions on an empty day create exactly 4 entries', async () => {
    const host = await loggedInClient(ctx, '10.53.0.1');
    const tpl = EventTemplateSchema.parse(
      (await host.client.post('/event-templates', { name: 'P', description: 'D', type: 'PASEO' }))
        .json,
    );
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => loggedInClient(ctx, `10.53.${i + 1}.1`)),
    );
    const results = await Promise.all(
      users.map((u) =>
        u.client.post('/calendar/entries', { templateId: tpl.id, date: '2031-08-15', capacity: 3 }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_EVENTS_PER_DAY);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(10 - MAX_EVENTS_PER_DAY);
    expect(rejected.every((r) => (r.json as { code: string }).code === 'DAY_FULL')).toBe(true);
    expect(await ctx.prisma.calendarEntry.count()).toBe(MAX_EVENTS_PER_DAY);
  });

  it('simultaneous additions on different days do not block or limit each other', async () => {
    const host = await loggedInClient(ctx, '10.54.0.1');
    const tpl = EventTemplateSchema.parse(
      (await host.client.post('/event-templates', { name: 'P', description: 'D', type: 'PASEO' }))
        .json,
    );
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        host.client.post('/calendar/entries', {
          templateId: tpl.id,
          date: `2031-09-${10 + i}`,
          capacity: 3,
        }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
  });
});
