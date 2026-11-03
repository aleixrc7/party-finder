import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_EVENTS_PER_DAY } from '@party-finder/shared';
import type {
  CalendarEntry,
  CalendarQuery,
  CalendarResponse,
  CreateCalendarEntryRequest,
} from '@party-finder/shared';
import { AppError } from '../common/errors';
import { PrismaService, TX_OPTIONS } from '../common/prisma.service';
import { entryInclude, toCalendarEntry } from './calendar.mapper';

function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

@Injectable()
export class CalendarService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Both ends inclusive; the schema already bounds the range to 42 days (so the query is bounded). */
  async list(query: CalendarQuery, currentUserId: string | null): Promise<CalendarResponse> {
    const rows = await this.prisma.calendarEntry.findMany({
      where: { date: { gte: toDbDate(query.from), lte: toDbDate(query.to) } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: entryInclude,
    });
    return {
      from: query.from,
      to: query.to,
      entries: rows.map((row) => toCalendarEntry(row, currentUserId)),
    };
  }

  /** One entry as the current user sees it. 404 if it does not exist. */
  async getEntry(id: string, currentUserId: string | null): Promise<CalendarEntry> {
    const row = await this.prisma.calendarEntry.findUnique({
      where: { id },
      include: entryInclude,
    });
    if (!row) throw AppError.notFound();
    return toCalendarEntry(row, currentUserId);
  }

  /**
   * Adds a template to a day. A transaction takes a per-date advisory lock, counts the day's
   * entries and inserts only if there are fewer than 4, so concurrent requests cannot overshoot.
   */
  async createEntry(userId: string, body: CreateCalendarEntryRequest): Promise<CalendarEntry> {
    const template = await this.prisma.eventTemplate.findUnique({
      where: { id: body.templateId },
      select: { id: true },
    });
    if (!template) throw AppError.notFound();

    const date = toDbDate(body.date);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.date}))`;
        const count = await tx.calendarEntry.count({ where: { date } });
        if (count >= MAX_EVENTS_PER_DAY) throw AppError.conflict('DAY_FULL');
        return tx.calendarEntry.create({
          data: {
            templateId: body.templateId,
            date,
            capacity: body.capacity,
            addedById: userId,
          },
          include: entryInclude,
        });
      }, TX_OPTIONS);
      return toCalendarEntry(created, userId);
    } catch (error) {
      // The template was deleted between the lookup and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw AppError.notFound();
      }
      throw error;
    }
  }

  /** Only the user who added the entry may remove it. Attendances are deleted with it. */
  async removeEntry(userId: string, id: string): Promise<void> {
    const entry = await this.prisma.calendarEntry.findUnique({
      where: { id },
      select: { addedById: true },
    });
    if (!entry) throw AppError.notFound();
    if (entry.addedById !== userId) throw AppError.forbidden();
    // deleteMany: a concurrent delete is not an error.
    await this.prisma.calendarEntry.deleteMany({ where: { id, addedById: userId } });
  }
}
