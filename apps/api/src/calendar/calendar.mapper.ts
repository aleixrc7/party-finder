import type { Prisma } from '@prisma/client';
import type { CalendarEntry } from '@party-finder/shared';
import { templateInclude, toEventTemplate } from '../event-templates/event-template.mapper';

const userSelect = { select: { id: true, username: true } } as const;

export const entryInclude = {
  template: { include: templateInclude },
  addedBy: userSelect,
  attendances: {
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    include: { user: userSelect },
  },
} satisfies Prisma.CalendarEntryInclude;

export type EntryWithRelations = Prisma.CalendarEntryGetPayload<{ include: typeof entryInclude }>;

/** `YYYY-MM-DD` for a Postgres DATE (Prisma returns it as midnight UTC). */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toCalendarEntry(
  row: EntryWithRelations,
  currentUserId: string | null,
): CalendarEntry {
  return {
    id: row.id,
    date: formatDate(row.date),
    capacity: row.capacity,
    attendeeCount: row.attendances.length,
    attendees: row.attendances.map((a) => ({ id: a.user.id, username: a.user.username })),
    addedBy: { id: row.addedBy.id, username: row.addedBy.username },
    template: toEventTemplate(row.template),
    createdAt: row.createdAt.toISOString(),
    isAttending: currentUserId !== null && row.attendances.some((a) => a.userId === currentUserId),
    canDelete: currentUserId !== null && row.addedById === currentUserId,
  };
}
