/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { UploadImageResponseSchema } from '@party-finder/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, S3_PUBLIC_URL, createTestContext, loggedInClient } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;
let client: Client;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.reset();
  ctx.storage.objects.clear();
  ({ client } = await loggedInClient(ctx, '10.30.0.1'));
});

const solid = (width: number, height: number) => ({
  create: { width, height, channels: 3 as const, background: { r: 200, g: 30, b: 30 } },
});

describe('POST /uploads/image', () => {
  it('re-encodes a large JPEG to WebP at max 1200 px wide, stripping metadata, under a random name', async () => {
    const jpeg = await sharp(solid(2400, 1200))
      .withExif({ IFD0: { Copyright: 'secreto-gps', Artist: 'Alguien' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const res = await client.upload('/uploads/image', jpeg, 'mi foto privada.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    const { url } = UploadImageResponseSchema.parse(res.json);
    expect(url).toMatch(new RegExp(`^${S3_PUBLIC_URL}/images/[0-9a-f-]{36}\\.webp$`));
    expect(url).not.toContain('foto');

    const key = url.replace(`${S3_PUBLIC_URL}/`, '');
    const stored = ctx.storage.objects.get(key)!;
    expect(stored.contentType).toBe('image/webp');
    const meta = await sharp(stored.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
    expect(meta.exif).toBeUndefined();
    expect(stored.body.includes(Buffer.from('secreto-gps'))).toBe(false);
  });

  it('accepts PNG and WebP, never enlarges a small image, and gives each upload a new name', async () => {
    const png = await sharp(solid(50, 40)).png().toBuffer();
    const webp = await sharp(solid(60, 60)).webp().toBuffer();
    const a = await client.upload('/uploads/image', png, 'a.png', 'image/png');
    const b = await client.upload('/uploads/image', webp, 'b.webp', 'image/webp');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const urlA = UploadImageResponseSchema.parse(a.json).url;
    const urlB = UploadImageResponseSchema.parse(b.json).url;
    expect(urlA).not.toBe(urlB);
    const metaA = await sharp(
      ctx.storage.objects.get(urlA.replace(`${S3_PUBLIC_URL}/`, ''))!.body,
    ).metadata();
    expect(metaA.width).toBe(50);
  });

  it('rejects SVG (even disguised as PNG) with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    for (const [name, type] of [
      ['a.svg', 'image/svg+xml'],
      ['a.png', 'image/png'],
    ] as const) {
      const res = await client.upload('/uploads/image', svg, name, type);
      expect(res.status).toBe(415);
      expect(res.json).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    }
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('rejects other types by real content: GIF, HTML, text and an executable with an image name', async () => {
    const gif = await sharp(solid(10, 10)).gif().toBuffer();
    for (const file of [
      gif,
      Buffer.from('<html><body>hi</body></html>'),
      Buffer.from('MZ\x90\x00 fake exe'),
      Buffer.alloc(0),
    ]) {
      const res = await client.upload('/uploads/image', file, 'x.jpg', 'image/jpeg');
      expect(res.status).toBe(415);
    }
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('rejects a corrupt image that only has a valid signature (415)', async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('garbage-not-a-jpeg'),
    ]);
    const res = await client.upload('/uploads/image', corrupt, 'x.jpg', 'image/jpeg');
    expect(res.status).toBe(415);
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('rejects a file over 5 MB with 413 PAYLOAD_TOO_LARGE', async () => {
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(5 * 1024 * 1024 + 1024),
    ]);
    const res = await client.upload('/uploads/image', big, 'big.jpg', 'image/jpeg');
    expect(res.status).toBe(413);
    expect(res.json).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('accepts a file just under 5 MB', async () => {
    const noise = await sharp({
      create: {
        width: 1250,
        height: 1250,
        channels: 3,
        background: '#000000',
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(noise.length).toBeGreaterThan(4 * 1024 * 1024);
    expect(noise.length).toBeLessThan(5 * 1024 * 1024);
    const res = await client.upload('/uploads/image', noise, 'ruido.png', 'image/png');
    expect(res.status).toBe(201);
  });

  it('400 when the file field is missing or has another name, or the body is not multipart', async () => {
    const png = await sharp(solid(10, 10)).png().toBuffer();
    const wrongField = await client.upload('/uploads/image', png, 'a.png', 'image/png', 'imagen');
    expect(wrongField.status).toBe(400);
    expect(wrongField.json).toMatchObject({ code: 'VALIDATION_ERROR' });
    const json = await client.post('/uploads/image', { file: 'x' });
    expect(json.status).toBe(400);
  });

  it('401 without a session and 403 without CSRF', async () => {
    const png = await sharp(solid(10, 10)).png().toBuffer();
    const anon = new Client(ctx, '10.30.0.2');
    await anon.fetchCsrf();
    expect((await anon.upload('/uploads/image', png, 'a.png', 'image/png')).status).toBe(401);
    const noCsrf = new Client(ctx, '10.30.0.3');
    noCsrf.cookie = client.cookie;
    expect((await noCsrf.upload('/uploads/image', png, 'a.png', 'image/png')).status).toBe(403);
  });

  it('an uploaded URL is accepted as a template imageUrl', async () => {
    const png = await sharp(solid(10, 10)).png().toBuffer();
    const { url } = UploadImageResponseSchema.parse(
      (await client.upload('/uploads/image', png, 'a.png', 'image/png')).json,
    );
    const res = await client.post('/event-templates', {
      name: 'Con imagen',
      description: 'Plantilla con imagen subida',
      type: 'OTROS',
      imageUrl: url,
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ imageUrl: url });
  });
});
