import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Logger } from 'pino';
import { LOGGER } from '../common/tokens';
import { UsersService } from '../users/users.service';

@Injectable()
export class CleanupService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Daily at 03:30: unverified accounts older than 7 days and expired verification tokens. */
  @Cron('30 3 * * *')
  async run(): Promise<{ users: number; tokens: number }> {
    try {
      const result = await this.users.deleteStale();
      this.logger.info(result, 'Stale unverified accounts and expired tokens cleaned up');
      return result;
    } catch (error) {
      this.logger.error({ errName: (error as Error).name }, 'Cleanup job failed');
      return { users: 0, tokens: 0 };
    }
  }
}
