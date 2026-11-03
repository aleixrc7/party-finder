/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { toCalendarEntry } from '../../src/calendar/calendar.mapper';
import { CalendarService } from '../../src/calendar/calendar.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

const templateRow = {
  id: 't1',
  owner: { id: 'u9', username: 'duena' },
  name: 'n',
  description: 'd',
  type: 'PASEO',
  imageUrl: null,
  attendees: 3,
  startTime: '10:00',
  endTime: null,
  createdAt: new Date('2031-01-01T00:00:00Z'),
  updatedAt: new Date('2031-01-01T00:00:00Z'),
};
const entryRow = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  date: new Date('2031-06-10T00:00:00Z'),
  capacity: 3,
  addedById: 'u1',
  addedBy: { id: 'u1', username: 'ana' },
  template: templateRow,
  createdAt: new Date('2031-01-05T10:00:00Z'),
  attendances: [
    { userId: 'u2', user: { id: 'u2', username: 'bruno' } },
    { userId: 'u3', user: { id: 'u3', username: 'carla' } },
  ],
  ...over,
});

describe('toCalendarEntry', () => {
  it('computes attendeeCount, isAttending and canDelete for the current user', () => {
    const asBruno = toCalendarEntry(entryRow() as never, 'u2');
    expect(asBruno).toMatchObject({
      id: 'e1',
      date: '2031-06-10',
      attendeeCount: 2,
      isAttending: true,
      canDelete: false,
      createdAt: '2031-01-05T10:00:00.000Z',
    });
    expect(asBruno.attendees.map((a) => a.username)).toEqual(['bruno', 'carla']);
    expect(asBruno.template.owner.username).toBe('duena');
    expect(toCalendarEntry(entryRow() as never, 'u1')).toMatchObject({
      isAttending: false,
      canDelete: true,
    });
  });

  it('is false for both flags without a session', () => {
    expect(toCalendarEntry(entryRow() as never, null)).toMatchObject({
      isAttending: false,
      canDelete: false,
    });
  });
});

function makeCalendar() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    calendarEntry: { count: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    eventTemplate: { findUnique: vi.fn().mockResolvedValue({ id: 't1' }) },
    calendarEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, prisma, service: new CalendarService(prisma as never) };
}

describe('CalendarService', () => {
  it('lists the inclusive range ordered by date, creation time and id', async () => {
    const { prisma, service } = makeCalendar();
    const result = await service.list({ from: '2031-06-01', to: '2031-06-30' }, null);
    expect(result).toEqual({ from: '2031-06-01', to: '2031-06-30', entries: [] });
    const args = prisma.calendarEntry.findMany.mock.calls[0]![0];
    expect(args.where.date).toEqual({
      gte: new Date('2031-06-01T00:00:00.000Z'),
      lte: new Date('2031-06-30T00:00:00.000Z'),
    });
    expect(args.orderBy).toEqual([{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('locks the date inside the transaction, then counts, then inserts', async () => {
    const { tx, service } = makeCalendar();
    tx.calendarEntry.count.mockResolvedValue(3);
    tx.calendarEntry.create.mockResolvedValue(entryRow());
    const entry = await service.createEntry('u1', {
      templateId: 't1',
      date: '2031-06-10',
      capacity: 3,
    });
    expect(entry.id).toBe('e1');
    const lockOrder = tx.$executeRaw.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(tx.calendarEntry.count.mock.invocationCallOrder[0]!);
    expect(tx.calendarEntry.count.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.calendarEntry.create.mock.invocationCallOrder[0]!,
    );
    const sql = (tx.$executeRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('pg_advisory_xact_lock(hashtext(');
    expect(tx.calendarEntry.create.mock.calls[0]![0].data).toMatchObject({
      templateId: 't1',
      capacity: 3,
      addedById: 'u1',
    });
  });

  it('409 DAY_FULL with 4 entries and does not insert', async () => {
    const { tx, service } = makeCalendar();
    tx.calendarEntry.count.mockResolvedValue(4);
    await expect(
      service.createEntry('u1', { templateId: 't1', date: '2031-06-10', capacity: 3 }),
    ).rejects.toMatchObject({ status: 409, code: 'DAY_FULL' });
    expect(tx.calendarEntry.create).not.toHaveBeenCalled();
  });

  it('404 when the template does not exist (also when it vanishes mid-way: FK violation)', async () => {
    const { prisma, tx, service } = makeCalendar();
    prisma.eventTemplate.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createEntry('u1', { templateId: 't1', date: '2031-06-10', capacity: 3 }),
    ).rejects.toMatchObject({ status: 404 });
    tx.calendarEntry.count.mockResolvedValue(0);
    tx.calendarEntry.create.mockRejectedValue(prismaError('P2003'));
    await expect(
      service.createEntry('u1', { templateId: 't1', date: '2031-06-10', capacity: 3 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('only the user who added an entry can remove it', async () => {
    const { prisma, service } = makeCalendar();
    prisma.calendarEntry.findUnique.mockResolvedValue({ addedById: 'u1' });
    await expect(service.removeEntry('u2', 'e1')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(prisma.calendarEntry.deleteMany).not.toHaveBeenCalled();
    await expect(service.removeEntry('u1', 'e1')).resolves.toBeUndefined();
    expect(prisma.calendarEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: 'e1', addedById: 'u1' },
    });
    prisma.calendarEntry.findUnique.mockResolvedValue(null);
    await expect(service.removeEntry('u1', 'e1')).rejects.toMatchObject({ status: 404 });
  });

  it('getEntry is 404 for an unknown id', async () => {
    const { prisma, service } = makeCalendar();
    prisma.calendarEntry.findUnique.mockResolvedValue(null);
    await expect(service.getEntry('e1', 'u1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('AttendanceService', () => {
  function make(locked: unknown[], already: unknown, count: number) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(locked),
      attendance: {
        findUnique: vi.fn().mockResolvedValue(already),
        count: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      attendance: { deleteMany: vi.fn() },
    };
    const calendar = { getEntry: vi.fn().mockResolvedValue({ id: 'e1' }) };
    return {
      tx,
      prisma,
      calendar,
      service: new AttendanceService(prisma as never, calendar as never),
    };
  }

  it('locks the entry row FOR UPDATE, counts, inserts and returns the refreshed entry', async () => {
    const { tx, service, calendar } = make([{ id: 'e1', capacity: 3 }], null, 2);
    expect(await service.attend('u1', 'e1')).toEqual({ id: 'e1' });
    const sql = (tx.$queryRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(/FROM calendar_entries WHERE id = \?::uuid FOR UPDATE/);
    expect(tx.attendance.create).toHaveBeenCalledWith({ data: { entryId: 'e1', userId: 'u1' } });
    expect(calendar.getEntry).toHaveBeenCalledWith('e1', 'u1');
  });

  it('404 when the entry does not exist', async () => {
    const { service, tx } = make([], null, 0);
    await expect(service.attend('u1', 'e1')).rejects.toMatchObject({ status: 404 });
    expect(tx.attendance.create).not.toHaveBeenCalled();
  });

  it('409 ENTRY_FULL when attendees reach capacity', async () => {
    const { service, tx } = make([{ id: 'e1', capacity: 3 }], null, 3);
    await expect(service.attend('u1', 'e1')).rejects.toMatchObject({
      status: 409,
      code: 'ENTRY_FULL',
    });
    expect(tx.attendance.create).not.toHaveBeenCalled();
  });

  it('409 ALREADY_ATTENDING, even if the entry is full, and on a primary-key collision', async () => {
    const full = make([{ id: 'e1', capacity: 1 }], { userId: 'u1' }, 1);
    await expect(full.service.attend('u1', 'e1')).rejects.toMatchObject({
      code: 'ALREADY_ATTENDING',
    });
    const race = make([{ id: 'e1', capacity: 5 }], null, 0);
    race.tx.attendance.create.mockRejectedValue(prismaError('P2002'));
    await expect(race.service.attend('u1', 'e1')).rejects.toMatchObject({
      code: 'ALREADY_ATTENDING',
    });
  });

  it('withdraw is 404 when there is nothing to remove', async () => {
    const { prisma, service } = make([], null, 0);
    prisma.attendance.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.unattend('u1', 'e1')).rejects.toMatchObject({ status: 404 });
    prisma.attendance.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.unattend('u1', 'e1')).resolves.toBeUndefined();
    expect(prisma.attendance.deleteMany).toHaveBeenCalledWith({
      where: { entryId: 'e1', userId: 'u1' },
    });
  });
});
