import { Controller, Get, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Public, SkipRateLimit } from '../common/decorators';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { REDIS } from '../common/tokens';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness and dependency check. Not part of the product contract. */
  @Public()
  @SkipRateLimit()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
    } catch {
      throw new AppError(503, 'INTERNAL_ERROR', 'Servicio no disponible');
    }
    return { status: 'ok' };
  }
}
