import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AttendResponse } from '@party-finder/shared';
import { CalendarService } from '../calendar/calendar.service';
import { AppError } from '../common/errors';
import { PrismaService, TX_OPTIONS } from '../common/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CalendarService) private readonly calendar: CalendarService,
  ) {}

  /**
   * Signs the user up. The entry row is locked (`FOR UPDATE`) inside the transaction that counts
   * attendees and inserts, so simultaneous sign-ups can never exceed `capacity`.
   */
  async attend(userId: string, entryId: string): Promise<AttendResponse> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; capacity: number }[]>`
          SELECT id, capacity FROM calendar_entries WHERE id = ${entryId}::uuid FOR UPDATE`;
        const entry = locked[0];
        if (!entry) throw AppError.notFound();

        const already = await tx.attendance.findUnique({
          where: { entryId_userId: { entryId, userId } },
          select: { userId: true },
        });
        if (already) throw AppError.conflict('ALREADY_ATTENDING');

        const count = await tx.attendance.count({ where: { entryId } });
        if (count >= entry.capacity) throw AppError.conflict('ENTRY_FULL');

        await tx.attendance.create({ data: { entryId, userId } });
      }, TX_OPTIONS);
    } catch (error) {
      // Backstop: the composite primary key still refuses a double sign-up.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('ALREADY_ATTENDING');
      }
      throw error;
    }
    return this.calendar.getEntry(entryId, userId);
  }

  /** 404 if the entry does not exist or the user is not attending it. */
  async unattend(userId: string, entryId: string): Promise<void> {
    const removed = await this.prisma.attendance.deleteMany({ where: { entryId, userId } });
    if (removed.count === 0) throw AppError.notFound();
  }
}
