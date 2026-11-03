import type { Prisma } from '@prisma/client';
import type { EventTemplate } from '@party-finder/shared';

export const templateInclude = {
  owner: { select: { id: true, username: true } },
} satisfies Prisma.EventTemplateInclude;

export type TemplateWithOwner = Prisma.EventTemplateGetPayload<{ include: typeof templateInclude }>;

export function toEventTemplate(row: TemplateWithOwner): EventTemplate {
  return {
    id: row.id,
    owner: { id: row.owner.id, username: row.owner.username },
    name: row.name,
    description: row.description,
    type: row.type,
    imageUrl: row.imageUrl,
    attendees: row.attendees,
    startTime: row.startTime,
    endTime: row.endTime,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
