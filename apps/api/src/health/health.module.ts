/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
