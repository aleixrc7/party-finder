import { z } from 'zod';
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UserSummarySchema,
  UuidSchema,
  daysInRangeInclusive,
} from './common';
import { MAX_CALENDAR_RANGE_DAYS } from './constants';
import { CapacitySchema, EventTemplateSchema } from './event-templates';

// GET /calendar?from&to — both dates inclusive
export const CalendarQuerySchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
  })
  .superRefine(({ from, to }, ctx) => {
    const days = daysInRangeInclusive(from, to);
    if (days < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: '`to` no puede ser anterior a `from`',
      });
    } else if (days > MAX_CALENDAR_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `El rango máximo es de ${MAX_CALENDAR_RANGE_DAYS} días`,
      });
    }
  });
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;

export const CalendarEntrySchema = z.object({
  id: UuidSchema,
  date: IsoDateSchema,
  /** Fixed once the entry is created. */
  capacity: CapacitySchema,
  attendeeCount: z.number().int().min(0),
  /** Ordered by sign-up time, oldest first. */
  attendees: z.array(UserSummarySchema),
  addedBy: UserSummarySchema,
  /** Always the template's current state: template edits show up here. */
  template: EventTemplateSchema,
  createdAt: IsoDateTimeSchema,
  /** Computed for the current user; `false` without a session. */
  isAttending: z.boolean(),
  /** Computed for the current user: `true` only for the user who added it; `false` without a session. */
  canDelete: z.boolean(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

/** Entries ordered by `date`, then `createdAt`. */
export const CalendarResponseSchema = z.object({
  from: IsoDateSchema,
  to: IsoDateSchema,
  entries: z.array(CalendarEntrySchema),
});
export type CalendarResponse = z.infer<typeof CalendarResponseSchema>;

// POST /calendar/entries
export const CreateCalendarEntryRequestSchema = z.strictObject({
  templateId: UuidSchema,
  date: IsoDateSchema,
  capacity: CapacitySchema,
});
export type CreateCalendarEntryRequest = z.infer<typeof CreateCalendarEntryRequestSchema>;

/** `POST /calendar/entries` → 201 */
export const CreateCalendarEntryResponseSchema = CalendarEntrySchema;
export type CreateCalendarEntryResponse = CalendarEntry;

/** `POST /calendar/entries/:id/attendance` → 201, the entry with the updated attendee list. */
export const AttendResponseSchema = CalendarEntrySchema;
export type AttendResponse = CalendarEntry;
