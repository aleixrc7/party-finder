import sharp from 'sharp';
import { AppError } from '../common/errors';

export type DetectedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_IMAGE_WIDTH = 1200;

/**
 * Detects the real type from the first bytes. Only JPEG, PNG and WebP are recognised, so SVG,
 * GIF, HTML or anything else disguised with an image extension or MIME type is `null`.
 * (A tiny signature check is used instead of a full file-type parser: three formats are all we
 * accept, and parsing arbitrary containers would only enlarge the attack surface.)
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Re-encodes to WebP, at most 1200 px wide, with all metadata (EXIF, ICC, GPS) stripped. The
 * re-encode also proves the file really decodes as an image. A corrupt file is a 415.
 */
export async function reencodeToWebp(input: Buffer): Promise<Buffer> {
  if (detectImageType(input) === null) throw AppError.unsupportedMedia();
  try {
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw AppError.unsupportedMedia();
  }
}
