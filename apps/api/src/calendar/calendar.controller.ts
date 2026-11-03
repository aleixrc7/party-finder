import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CalendarQuerySchema,
  CreateCalendarEntryRequestSchema,
  IdParamsSchema,
} from '@party-finder/shared';
import type {
  CalendarQuery,
  CalendarResponse,
  CreateCalendarEntryRequest,
  CreateCalendarEntryResponse,
  IdParams,
} from '@party-finder/shared';
import { CurrentUser, OptionalUser, Public } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Public()
  @Get()
  list(
    @Query(new ZodPipe(CalendarQuerySchema)) query: CalendarQuery,
    @OptionalUser() user: AuthenticatedUser | null,
  ): Promise<CalendarResponse> {
    return this.calendar.list(query, user?.id ?? null);
  }

  @Post('entries')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(CreateCalendarEntryRequestSchema)) body: CreateCalendarEntryRequest,
  ): Promise<CreateCalendarEntryResponse> {
    return this.calendar.createEntry(user.id, body);
  }

  @Delete('entries/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodPipe(IdParamsSchema)) params: IdParams,
  ): Promise<void> {
    await this.calendar.removeEntry(user.id, params.id);
  }
}
