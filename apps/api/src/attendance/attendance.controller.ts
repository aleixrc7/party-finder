import { Controller, Delete, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { IdParamsSchema } from '@party-finder/shared';
import type { AttendResponse, IdParams } from '@party-finder/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AttendanceService } from './attendance.service';

@Controller('calendar/entries/:id/attendance')
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Post()
  @HttpCode(201)
  attend(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodPipe(IdParamsSchema)) params: IdParams,
  ): Promise<AttendResponse> {
    return this.attendance.attend(user.id, params.id);
  }

  @Delete()
  @HttpCode(204)
  async unattend(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodPipe(IdParamsSchema)) params: IdParams,
  ): Promise<void> {
    await this.attendance.unattend(user.id, params.id);
  }
}
