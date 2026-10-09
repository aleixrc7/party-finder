import { z } from 'zod';
import {
  IsoDateTimeSchema,
  PaginationQuerySchema,
  TimeOfDaySchema,
  UserSummarySchema,
  UuidSchema,
  paginatedSchema,
} from './common';
import {
  IMAGE_URL_MAX_LENGTH,
  MAX_CAPACITY,
  MIN_CAPACITY,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
} from './constants';
import { EventTypeSchema } from './enums';

export const CapacitySchema = z
  .number()
  .int()
  .min(MIN_CAPACITY, `Mínimo ${MIN_CAPACITY}`)
  .max(MAX_CAPACITY, `Máximo ${MAX_CAPACITY}`);

const TemplateNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(TEMPLATE_NAME_MAX_LENGTH, `Máximo ${TEMPLATE_NAME_MAX_LENGTH} caracteres`);

const TemplateDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'La descripción es obligatoria')
  .max(TEMPLATE_DESCRIPTION_MAX_LENGTH, `Máximo ${TEMPLATE_DESCRIPTION_MAX_LENGTH} caracteres`);

/** Must be a URL returned by `POST /uploads/image`. The server rejects foreign hosts. */
const ImageUrlSchema = z.url({ protocol: /^https?$/ }).max(IMAGE_URL_MAX_LENGTH);

const templateFields = {
  name: TemplateNameSchema,
  description: TemplateDescriptionSchema,
  type: EventTypeSchema,
  imageUrl: ImageUrlSchema.nullable(),
  /** Default for the 1–10 capacity dropdown when the template is added to a day. */
  attendees: CapacitySchema.nullable(),
  /** No ordering is enforced between start and end: an event may run past midnight. */
  startTime: TimeOfDaySchema.nullable(),
  endTime: TimeOfDaySchema.nullable(),
};

// POST /event-templates
export const CreateEventTemplateRequestSchema = z.strictObject({
  name: templateFields.name,
  description: templateFields.description,
  type: templateFields.type,
  imageUrl: templateFields.imageUrl.optional(),
  attendees: templateFields.attendees.optional(),
  startTime: templateFields.startTime.optional(),
  endTime: templateFields.endTime.optional(),
});
export type CreateEventTemplateRequest = z.infer<typeof CreateEventTemplateRequestSchema>;
export type CreateEventTemplateRequestInput = z.input<typeof CreateEventTemplateRequestSchema>;

// PATCH /event-templates/:id
/** Partial update. Send `null` to clear an optional field; omit a field to leave it unchanged. */
export const UpdateEventTemplateRequestSchema = z
  .strictObject({
    name: templateFields.name.optional(),
    description: templateFields.description.optional(),
    type: templateFields.type.optional(),
    imageUrl: templateFields.imageUrl.optional(),
    attendees: templateFields.attendees.optional(),
    startTime: templateFields.startTime.optional(),
    endTime: templateFields.endTime.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Indica al menos un campo a modificar',
  });
export type UpdateEventTemplateRequest = z.infer<typeof UpdateEventTemplateRequestSchema>;

// Response shape shared by every template endpoint
export const EventTemplateSchema = z.object({
  id: UuidSchema,
  owner: UserSummarySchema,
  name: z.string(),
  description: z.string(),
  type: EventTypeSchema,
  imageUrl: z.string().nullable(),
  attendees: CapacitySchema.nullable(),
  startTime: TimeOfDaySchema.nullable(),
  endTime: TimeOfDaySchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type EventTemplate = z.infer<typeof EventTemplateSchema>;

// GET /event-templates — ordered by createdAt, newest first
export const ListEventTemplatesQuerySchema = PaginationQuerySchema;
export type ListEventTemplatesQuery = z.infer<typeof ListEventTemplatesQuerySchema>;

export const EventTemplatePageSchema = paginatedSchema(EventTemplateSchema);
export type EventTemplatePage = z.infer<typeof EventTemplatePageSchema>;
