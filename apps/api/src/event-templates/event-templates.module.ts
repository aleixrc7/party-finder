/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import { EventTemplatesController } from './event-templates.controller';
import { EventTemplatesService } from './event-templates.service';
import { OwnerGuard } from './owner.guard';

@Module({
  controllers: [EventTemplatesController],
  providers: [EventTemplatesService, OwnerGuard],
  exports: [EventTemplatesService],
})
export class EventTemplatesModule {}
