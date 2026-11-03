/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImageType, reencodeToWebp } from '../../src/uploads/image-processing';
import { UploadsService } from '../../src/uploads/uploads.service';
import { FakeStorage } from '../helpers/fakes';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } });

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their signature, ignoring names and declared types', async () => {
    expect(detectImageType(await solid(8, 8).jpeg().toBuffer())).toBe('image/jpeg');
    expect(detectImageType(await solid(8, 8).png().toBuffer())).toBe('image/png');
    expect(detectImageType(await solid(8, 8).webp().toBuffer())).toBe('image/webp');
  });

  it('rejects everything else', async () => {
    expect(detectImageType(await solid(8, 8).gif().toBuffer())).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF....WAVEfmt '))).toBeNull(); // RIFF but not WebP
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull(); // truncated signature
  });
});

describe('reencodeToWebp', () => {
  it('outputs WebP, caps the width at 1200 and never upscales', async () => {
    const wide = await reencodeToWebp(await solid(3000, 1500).png().toBuffer());
    const meta = await sharp(wide).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1200, height: 600 });
    const small = await reencodeToWebp(await solid(100, 50).jpeg().toBuffer());
    expect((await sharp(small).metadata()).width).toBe(100);
  });

  it('strips EXIF metadata and applies the orientation first', async () => {
    const jpeg = await solid(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).orientation).toBe(6);
    const out = await reencodeToWebp(jpeg);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.width).toBe(100); // rotated by the orientation tag
    expect(meta.height).toBe(200);
  });

  it('415 for unsupported or corrupt input', async () => {
    await expect(reencodeToWebp(Buffer.from('<svg/>'))).rejects.toMatchObject({ status: 415 });
    const corrupt = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('not really'),
    ]);
    await expect(reencodeToWebp(corrupt)).rejects.toMatchObject({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('415 for an image with an absurd pixel count (decompression bomb guard)', async () => {
    const bomb = await sharp({
      create: { width: 7000, height: 7000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(reencodeToWebp(bomb)).rejects.toMatchObject({ status: 415 });
  });
});

describe('UploadsService', () => {
  it('stores under images/<uuid>.webp with a WebP content type and returns the public URL', async () => {
    const storage = new FakeStorage('http://cdn.test/bucket');
    const service = new UploadsService(storage);
    const a = await service.uploadImage(await solid(20, 20).png().toBuffer());
    const b = await service.uploadImage(await solid(20, 20).png().toBuffer());
    expect(a.url).toMatch(/^http:\/\/cdn\.test\/bucket\/images\/[0-9a-f-]{36}\.webp$/);
    expect(a.url).not.toBe(b.url);
    const [object] = [...storage.objects.values()];
    expect(object!.contentType).toBe('image/webp');
  });

  it('stores nothing when the file is rejected', async () => {
    const storage = new FakeStorage('http://cdn.test/bucket');
    await expect(
      new UploadsService(storage).uploadImage(Buffer.from('nope')),
    ).rejects.toMatchObject({
      status: 415,
    });
    expect(storage.objects.size).toBe(0);
  });
});
