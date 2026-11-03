import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { IdParamsSchema } from '@party-finder/shared';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { parseWith } from '../common/zod.pipe';

/**
 * Only the template's owner passes: 404 if it does not exist, 403 if `ownerId !== user.id`.
 * Guards run before pipes, so the `:id` shape is validated here (400 for a non-UUID).
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const { id } = parseWith(IdParamsSchema, req.params);
    const userId = req.appSession?.userId;
    if (!userId) throw AppError.unauthenticated();
    const template = await this.prisma.eventTemplate.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!template) throw AppError.notFound();
    if (template.ownerId !== userId) throw AppError.forbidden();
    return true;
  }
}
