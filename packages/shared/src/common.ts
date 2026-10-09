import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TIME_OF_DAY_PATTERN,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './constants';

export const UuidSchema = z.uuid();

/** Calendar date without time, `YYYY-MM-DD`. Rejects impossible dates such as 2026-02-30. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** UTC timestamp, e.g. `2026-10-09T18:30:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime();

/** Time of day `HH:mm` (24h). The date always comes from the calendar entry. */
export const TimeOfDaySchema = z
  .string()
  .regex(TIME_OF_DAY_PATTERN, 'Debe tener el formato HH:mm (00:00–23:59)');

export const UsernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, `Mínimo ${USERNAME_MIN_LENGTH} caracteres`)
  .max(USERNAME_MAX_LENGTH, `Máximo ${USERNAME_MAX_LENGTH} caracteres`)
  .regex(USERNAME_PATTERN, 'Solo letras, números, guion bajo (_) y guion (-)');

/** Public view of a user. Never includes credentials. */
export const UserSummarySchema = z.object({
  id: UuidSchema,
  username: z.string(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

/** Path params for routes with `:id`. */
export const IdParamsSchema = z.object({ id: UuidSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

/** `?page&pageSize`. Values arrive as strings and are coerced. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof PaginationQuerySchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  });
}

/** Number of days from `from` to `to`, both inclusive. Both must be valid `YYYY-MM-DD`. */
export function daysInRangeInclusive(from: IsoDate, to: IsoDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}
