import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { UploadImageResponse } from '@party-finder/shared';
import { OBJECT_STORAGE } from '../common/tokens';
import { reencodeToWebp } from './image-processing';
import type { ObjectStorage } from './object-storage';

@Injectable()
export class UploadsService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  /** Validates by content, re-encodes to WebP and stores under a random name (never the original). */
  async uploadImage(file: Buffer): Promise<UploadImageResponse> {
    const webp = await reencodeToWebp(file);
    const url = await this.storage.put(`images/${randomUUID()}.webp`, webp, 'image/webp');
    return { url };
  }
}
