/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OwnerGuard } from '../../src/event-templates/owner.guard';
import { EventTemplatesService } from '../../src/event-templates/event-templates.service';
import type { Env } from '../../src/config/env';

const env = { S3_PUBLIC_URL: 'http://localhost:9000/bucket/' } as Env;
const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  owner: { id: 'u1', username: 'ana' },
  name: 'n',
  description: 'd',
  type: 'DND',
  imageUrl: null,
  attendees: null,
  startTime: null,
  endTime: null,
  createdAt: new Date('2031-01-01T00:00:00Z'),
  updatedAt: new Date('2031-01-02T00:00:00Z'),
  ...over,
});
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

function make() {
  const prisma = {
    eventTemplate: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    calendarEntry: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, service: new EventTemplatesService(prisma as never, env) };
}

describe('EventTemplatesService', () => {
  it('accepts only image URLs that live directly under <S3_PUBLIC_URL>/images/', () => {
    const { service } = make();
    expect(() => service.assertOwnImageUrl(null)).not.toThrow();
    expect(() => service.assertOwnImageUrl(undefined)).not.toThrow();
    expect(() =>
      service.assertOwnImageUrl('http://localhost:9000/bucket/images/a.webp'),
    ).not.toThrow();
    for (const bad of [
      'https://evil.example.com/a.webp',
      'http://localhost:9000/bucket/images/',
      'http://localhost:9000/bucket/images/a/b.webp',
      'http://localhost:9000/bucket/images/../x.webp',
      'http://localhost:9000/bucket/images/a.webp?x=1',
      'http://localhost:9000/bucket/images/a.webp#f',
      'http://u:p@localhost:9000/bucket/images/a.webp',
      'http://localhost:9000/bucket/other/a.webp',
      'not a url',
    ]) {
      expect(() => service.assertOwnImageUrl(bad), bad).toThrowError(/Datos no válidos/);
    }
  });

  it('lists with stable newest-first ordering, offset pagination and totalPages', async () => {
    const { prisma, service } = make();
    prisma.eventTemplate.count.mockResolvedValue(45);
    prisma.eventTemplate.findMany.mockResolvedValue([row()]);
    const page = await service.list({ page: 3, pageSize: 20 });
    expect(page).toMatchObject({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
    expect(page.items[0]).toMatchObject({
      id: 't1',
      owner: { username: 'ana' },
      createdAt: '2031-01-01T00:00:00.000Z',
    });
    expect(prisma.eventTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('create sets the owner from the session and nulls unset optionals', async () => {
    const { prisma, service } = make();
    prisma.eventTemplate.create.mockResolvedValue(row());
    await service.create('u1', { name: 'n', description: 'd', type: 'DND' });
    expect(prisma.eventTemplate.create.mock.calls[0]![0].data).toEqual({
      ownerId: 'u1',
      name: 'n',
      description: 'd',
      type: 'DND',
      imageUrl: null,
      attendees: null,
      startTime: null,
      endTime: null,
    });
  });

  it('update sends only the fields present (null clears, omitted stays)', async () => {
    const { prisma, service } = make();
    prisma.eventTemplate.update.mockResolvedValue(row());
    await service.update('t1', { description: 'nueva', attendees: null });
    expect(prisma.eventTemplate.update.mock.calls[0]![0].data).toEqual({
      description: 'nueva',
      attendees: null,
    });
  });

  it('update maps a vanished row to 404', async () => {
    const { prisma, service } = make();
    prisma.eventTemplate.update.mockRejectedValue(prismaError('P2025'));
    await expect(service.update('t1', { name: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('delete is 409 TEMPLATE_IN_USE while entries use it, without deleting', async () => {
    const { prisma, service } = make();
    prisma.calendarEntry.count.mockResolvedValue(2);
    await expect(service.remove('t1')).rejects.toMatchObject({
      status: 409,
      code: 'TEMPLATE_IN_USE',
    });
    expect(prisma.eventTemplate.delete).not.toHaveBeenCalled();
  });

  it('delete maps the RESTRICT foreign key (a race with a new entry) to 409 and a missing row to 404', async () => {
    const { prisma, service } = make();
    prisma.eventTemplate.delete.mockRejectedValueOnce(prismaError('P2003'));
    await expect(service.remove('t1')).rejects.toMatchObject({ code: 'TEMPLATE_IN_USE' });
    prisma.eventTemplate.delete.mockRejectedValueOnce(prismaError('P2025'));
    await expect(service.remove('t1')).rejects.toMatchObject({ status: 404 });
    prisma.eventTemplate.delete.mockResolvedValueOnce({});
    await expect(service.remove('t1')).resolves.toBeUndefined();
  });
});

describe('OwnerGuard', () => {
  const ctx = (params: unknown, userId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ params, appSession: userId ? { userId } : undefined }),
      }),
    }) as never;
  const ID = '00000000-0000-4000-8000-000000000001';

  it('passes only for the owner', async () => {
    const prisma = { eventTemplate: { findUnique: vi.fn().mockResolvedValue({ ownerId: 'u1' }) } };
    const guard = new OwnerGuard(prisma as never);
    await expect(guard.canActivate(ctx({ id: ID }, 'u1'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ id: ID }, 'u2'))).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('is 400 for a malformed id (before any query), 404 when missing and 401 without a user', async () => {
    const prisma = { eventTemplate: { findUnique: vi.fn().mockResolvedValue(null) } };
    const guard = new OwnerGuard(prisma as never);
    await expect(guard.canActivate(ctx({ id: 'nope' }, 'u1'))).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.eventTemplate.findUnique).not.toHaveBeenCalled();
    await expect(guard.canActivate(ctx({ id: ID }, 'u1'))).rejects.toMatchObject({ status: 404 });
    await expect(guard.canActivate(ctx({ id: ID }))).rejects.toMatchObject({ status: 401 });
  });
});
