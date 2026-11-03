import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env';

export interface ObjectStorage {
  /** Stores `body` under `key` and returns its public URL. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
}

/** S3-compatible storage: MinIO locally, S3 or R2 in production. */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly publicBase: string;

  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
    this.publicBase = env.S3_PUBLIC_URL.replace(/\/+$/, '');
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicBase}/${key}`;
  }
}
