/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import type { Logger } from 'pino';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { CoreModule } from './common/core.module';
import type { AppOverrides } from './common/core.module';
import type { Env } from './config/env';
import { EventTemplatesModule } from './event-templates/event-templates.module';
import { HealthModule } from './health/health.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({})
export class AppModule {
  static forRoot(env: Env, logger: Logger, overrides: AppOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env, logger, overrides),
        ScheduleModule.forRoot(),
        AuthModule,
        EventTemplatesModule,
        UploadsModule,
        CalendarModule,
        AttendanceModule,
        HealthModule,
      ],
    };
  }
}
