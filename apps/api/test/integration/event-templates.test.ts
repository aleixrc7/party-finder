import { EventTemplatePageSchema, EventTemplateSchema } from '@party-finder/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, S3_PUBLIC_URL, createTestContext, loggedInClient } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const valid = { name: 'Noche de rol', description: 'Campaña de D&D', type: 'DND' };

describe('event templates', () => {
  it('requires a session for every endpoint (401) and CSRF on writes (403)', async () => {
    const anon = new Client(ctx, '10.20.0.1');
    await anon.fetchCsrf();
    expect((await anon.get('/event-templates')).status).toBe(401);
    expect((await anon.post('/event-templates', valid)).status).toBe(401);
    expect(
      (await anon.patch('/event-templates/00000000-0000-4000-8000-000000000000', { name: 'x' }))
        .status,
    ).toBe(401);
    expect(
      (await anon.delete('/event-templates/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(401);

    const { client } = await loggedInClient(ctx, '10.20.0.2');
    expect((await client.post('/event-templates', valid, { noCsrf: true })).status).toBe(403);
  });

  it('creates a template owned by the caller (201) and applies null defaults', async () => {
    const { client, user } = await loggedInClient(ctx, '10.20.0.3');
    const res = await client.post('/event-templates', valid);
    expect(res.status).toBe(201);
    const tpl = EventTemplateSchema.parse(res.json);
    expect(tpl.owner).toEqual({ id: user.id, username: user.username });
    expect(tpl).toMatchObject({ imageUrl: null, attendees: null, startTime: null, endTime: null });
    expect(tpl.name).toBe('Noche de rol');
  });

  it('creates with every optional field and allows endTime before startTime', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.4');
    const res = await client.post('/event-templates', {
      ...valid,
      attendees: 6,
      startTime: '22:00',
      endTime: '02:00',
      imageUrl: `${S3_PUBLIC_URL}/images/abc.webp`,
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ attendees: 6, startTime: '22:00', endTime: '02:00' });
  });

  it('validates the body: required fields, enum, ranges, times and unknown fields (400)', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.5');
    const cases: unknown[] = [
      {},
      { ...valid, name: '   ' },
      { ...valid, type: 'FIESTA' },
      { ...valid, attendees: 11 },
      { ...valid, attendees: 0 },
      { ...valid, startTime: '25:00' },
      { ...valid, name: 'x'.repeat(81) },
      { ...valid, ownerId: 'someone-else' },
      { ...valid, imageUrl: 'not a url' },
    ];
    for (const body of cases) {
      const res = await client.post('/event-templates', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('rejects image URLs that were not produced by the upload endpoint (400)', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.6');
    for (const imageUrl of [
      'https://evil.example.com/a.webp',
      `${S3_PUBLIC_URL}/images/../secret.webp`,
      `${S3_PUBLIC_URL}/other/a.webp`,
      `${S3_PUBLIC_URL}/images/a.webp?x=1`,
      'http://storage.test@evil.example.com/party-finder-images/images/a.webp',
    ]) {
      const res = await client.post('/event-templates', { ...valid, imageUrl });
      expect(res.status, imageUrl).toBe(400);
      expect(res.json).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('lists every user template newest first with pagination', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.7');
    const other = await loggedInClient(ctx, '10.20.0.8');
    for (let i = 0; i < 5; i++) {
      await (i % 2 ? other.client : client).post('/event-templates', {
        ...valid,
        name: `Plantilla ${i}`,
      });
    }
    const page1 = EventTemplatePageSchema.parse(
      (await client.get('/event-templates?page=1&pageSize=2')).json,
    );
    expect(page1).toMatchObject({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(page1.items.map((t) => t.name)).toEqual(['Plantilla 4', 'Plantilla 3']);
    const page3 = EventTemplatePageSchema.parse(
      (await client.get('/event-templates?page=3&pageSize=2')).json,
    );
    expect(page3.items.map((t) => t.name)).toEqual(['Plantilla 0']);
    const beyond = EventTemplatePageSchema.parse(
      (await client.get('/event-templates?page=9&pageSize=2')).json,
    );
    expect(beyond.items).toEqual([]);
    const def = EventTemplatePageSchema.parse((await client.get('/event-templates')).json);
    expect(def).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('rejects out-of-range pagination (400): pageSize > 50, page < 1', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.9');
    expect((await client.get('/event-templates?pageSize=51')).status).toBe(400);
    expect((await client.get('/event-templates?page=0')).status).toBe(400);
    expect((await client.get('/event-templates?page=abc')).status).toBe(400);
  });

  it('PATCH is partial, null clears optional fields, and updates updatedAt', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.10');
    const created = EventTemplateSchema.parse(
      (
        await client.post('/event-templates', {
          ...valid,
          attendees: 4,
          startTime: '10:00',
          endTime: '12:00',
        })
      ).json,
    );
    await new Promise((r) => setTimeout(r, 15));
    const res = await client.patch(`/event-templates/${created.id}`, {
      description: 'Nueva descripción',
      attendees: null,
      startTime: '11:30',
    });
    expect(res.status).toBe(200);
    const updated = EventTemplateSchema.parse(res.json);
    expect(updated).toMatchObject({
      name: created.name,
      description: 'Nueva descripción',
      attendees: null,
      startTime: '11:30',
      endTime: '12:00',
    });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('PATCH validates: empty body, null on required field, unknown field, bad id (400)', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.11');
    const created = EventTemplateSchema.parse((await client.post('/event-templates', valid)).json);
    for (const body of [{}, { name: null }, { owner: 'x' }, { type: 'NOPE' }]) {
      expect((await client.patch(`/event-templates/${created.id}`, body)).status).toBe(400);
    }
    expect((await client.patch('/event-templates/not-a-uuid', { name: 'x' })).status).toBe(400);
    expect((await client.delete('/event-templates/not-a-uuid')).status).toBe(400);
  });

  it('PATCH and DELETE by a non-owner are 403, and nothing changes', async () => {
    const owner = await loggedInClient(ctx, '10.20.0.12');
    const intruder = await loggedInClient(ctx, '10.20.0.13');
    const created = EventTemplateSchema.parse(
      (await owner.client.post('/event-templates', valid)).json,
    );

    const patch = await intruder.client.patch(`/event-templates/${created.id}`, {
      name: 'Hackeado',
    });
    expect(patch.status).toBe(403);
    expect(patch.json).toEqual({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para esta acción',
    });
    const del = await intruder.client.delete(`/event-templates/${created.id}`);
    expect(del.status).toBe(403);

    const row = await ctx.prisma.eventTemplate.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.name).toBe('Noche de rol');
  });

  it('PATCH and DELETE of an unknown id are 404', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.14');
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await client.patch(`/event-templates/${id}`, { name: 'x' })).json).toEqual({
      code: 'NOT_FOUND',
      message: 'No encontrado',
    });
    expect((await client.delete(`/event-templates/${id}`)).status).toBe(404);
  });

  it('DELETE removes an unused template (204) and is 409 TEMPLATE_IN_USE when it has entries', async () => {
    const { client } = await loggedInClient(ctx, '10.20.0.15');
    const free = EventTemplateSchema.parse((await client.post('/event-templates', valid)).json);
    expect((await client.delete(`/event-templates/${free.id}`)).status).toBe(204);
    expect(await ctx.prisma.eventTemplate.count()).toBe(0);

    const used = EventTemplateSchema.parse((await client.post('/event-templates', valid)).json);
    expect(
      (
        await client.post('/calendar/entries', {
          templateId: used.id,
          date: '2031-05-05',
          capacity: 3,
        })
      ).status,
    ).toBe(201);
    const res = await client.delete(`/event-templates/${used.id}`);
    expect(res.status).toBe(409);
    expect(res.json).toEqual({
      code: 'TEMPLATE_IN_USE',
      message: 'La plantilla está en uso en el calendario',
    });
    expect(await ctx.prisma.eventTemplate.count()).toBe(1);
  });
});
