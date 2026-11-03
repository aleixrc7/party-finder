import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { ENV } from './tokens';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL, log: ['warn', 'error'] });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Options for interactive transactions that wait on locks under concurrent load. */
export const TX_OPTIONS = { maxWait: 15_000, timeout: 15_000 } as const;
