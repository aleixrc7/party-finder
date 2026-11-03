import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { MAX_IMAGE_BYTES, UPLOAD_IMAGE_FIELD } from '@party-finder/shared';
import type { UploadImageResponse } from '@party-finder/shared';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../common/errors';
import { UploadsService } from './uploads.service';

/** Multipart overhead allowance on top of the 5 MB of file content. */
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

@Controller('uploads')
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post('image')
  @HttpCode(201)
  async uploadImage(@Req() req: FastifyRequest): Promise<UploadImageResponse> {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw AppError.payloadTooLarge();
    if (!req.isMultipart()) {
      throw AppError.invalidField(UPLOAD_IMAGE_FIELD, 'Se esperaba multipart/form-data');
    }

    const part = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    if (!part || part.fieldname !== UPLOAD_IMAGE_FIELD) {
      throw AppError.invalidField(UPLOAD_IMAGE_FIELD, 'Falta el archivo');
    }
    // Throws FST_REQ_FILE_TOO_LARGE (mapped to 413) as soon as the 5 MB limit is passed.
    const buffer = await part.toBuffer();
    if (part.file.truncated) throw AppError.payloadTooLarge();
    return this.uploads.uploadImage(buffer);
  }
}
