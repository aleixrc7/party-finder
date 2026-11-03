import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateEventTemplateRequestSchema,
  IdParamsSchema,
  ListEventTemplatesQuerySchema,
  UpdateEventTemplateRequestSchema,
} from '@party-finder/shared';
import type {
  CreateEventTemplateRequest,
  EventTemplate,
  EventTemplatePage,
  IdParams,
  ListEventTemplatesQuery,
  UpdateEventTemplateRequest,
} from '@party-finder/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { EventTemplatesService } from './event-templates.service';
import { OwnerGuard } from './owner.guard';

@Controller('event-templates')
export class EventTemplatesController {
  constructor(@Inject(EventTemplatesService) private readonly templates: EventTemplatesService) {}

  @Get()
  list(
    @Query(new ZodPipe(ListEventTemplatesQuerySchema)) query: ListEventTemplatesQuery,
  ): Promise<EventTemplatePage> {
    return this.templates.list(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(CreateEventTemplateRequestSchema)) body: CreateEventTemplateRequest,
  ): Promise<EventTemplate> {
    return this.templates.create(user.id, body);
  }

  @Patch(':id')
  @UseGuards(OwnerGuard)
  update(
    @Param(new ZodPipe(IdParamsSchema)) params: IdParams,
    @Body(new ZodPipe(UpdateEventTemplateRequestSchema)) body: UpdateEventTemplateRequest,
  ): Promise<EventTemplate> {
    return this.templates.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(OwnerGuard)
  async remove(@Param(new ZodPipe(IdParamsSchema)) params: IdParams): Promise<void> {
    await this.templates.remove(params.id);
  }
}
