import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateEventTemplateRequest,
  EventTemplate,
  EventTemplatePage,
  ListEventTemplatesQuery,
  UpdateEventTemplateRequest,
} from '@party-finder/shared';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ENV } from '../common/tokens';
import type { Env } from '../config/env';
import { templateInclude, toEventTemplate } from './event-template.mapper';

@Injectable()
export class EventTemplatesService {
  /** Images must come from `POST /uploads/image`: only our own public base URL is accepted. */
  private readonly imagePrefix: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.imagePrefix = `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/images/`;
  }

  assertOwnImageUrl(imageUrl: string | null | undefined): void {
    if (imageUrl === undefined || imageUrl === null) return;
    let normalized: string;
    try {
      const url = new URL(imageUrl);
      if (url.username || url.password || url.search || url.hash) throw new Error('bad');
      normalized = url.href;
    } catch {
      throw AppError.invalidField('imageUrl', 'La imagen no es válida');
    }
    const rest = normalized.slice(this.imagePrefix.length);
    if (!normalized.startsWith(this.imagePrefix) || rest === '' || rest.includes('/')) {
      throw AppError.invalidField('imageUrl', 'La imagen debe subirse con /uploads/image');
    }
  }

  async list(query: ListEventTemplatesQuery): Promise<EventTemplatePage> {
    const { page, pageSize } = query;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.eventTemplate.count(),
      this.prisma.eventTemplate.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: templateInclude,
      }),
    ]);
    return {
      items: rows.map(toEventTemplate),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(ownerId: string, body: CreateEventTemplateRequest): Promise<EventTemplate> {
    this.assertOwnImageUrl(body.imageUrl);
    const row = await this.prisma.eventTemplate.create({
      data: {
        ownerId,
        name: body.name,
        description: body.description,
        type: body.type,
        imageUrl: body.imageUrl ?? null,
        attendees: body.attendees ?? null,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
      },
      include: templateInclude,
    });
    return toEventTemplate(row);
  }

  /** Partial update: omitted fields stay as they are, `null` clears an optional field. */
  async update(id: string, body: UpdateEventTemplateRequest): Promise<EventTemplate> {
    this.assertOwnImageUrl(body.imageUrl);
    const data: Prisma.EventTemplateUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.type !== undefined) data.type = body.type;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
    if (body.attendees !== undefined) data.attendees = body.attendees;
    if (body.startTime !== undefined) data.startTime = body.startTime;
    if (body.endTime !== undefined) data.endTime = body.endTime;
    try {
      const row = await this.prisma.eventTemplate.update({
        where: { id },
        data,
        include: templateInclude,
      });
      return toEventTemplate(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw AppError.notFound();
      }
      throw error;
    }
  }

  /** 409 TEMPLATE_IN_USE while any calendar entry uses it (the FK is RESTRICT as a backstop). */
  async remove(id: string): Promise<void> {
    const inUse = await this.prisma.calendarEntry.count({ where: { templateId: id } });
    if (inUse > 0) throw AppError.conflict('TEMPLATE_IN_USE');
    try {
      await this.prisma.eventTemplate.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') throw AppError.conflict('TEMPLATE_IN_USE');
        if (error.code === 'P2025') throw AppError.notFound();
      }
      throw error;
    }
  }
}
