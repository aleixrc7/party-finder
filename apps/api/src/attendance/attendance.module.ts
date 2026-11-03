/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [CalendarModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
