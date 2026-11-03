/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import type { AppOverrides } from '../common/core.module';
import { ENV, OBJECT_STORAGE, OVERRIDES } from '../common/tokens';
import type { Env } from '../config/env';
import { S3ObjectStorage } from './object-storage';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: OBJECT_STORAGE,
      inject: [ENV, OVERRIDES],
      useFactory: (env: Env, overrides: AppOverrides) =>
        overrides.objectStorage ?? new S3ObjectStorage(env),
    },
  ],
})
export class UploadsModule {}
