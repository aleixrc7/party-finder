/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../src/auth/password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id (PHC string, version 19, m >= 19 MiB) and a fresh salt each time', async () => {
    const a = await service.hash('correct horse');
    const b = await service.hash('correct horse');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=(\d+),t=\d+,p=\d+\$/);
    expect(Number(/m=(\d+)/.exec(a)![1])).toBeGreaterThanOrEqual(19456);
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse');
  });

  it('verifies the right password and rejects wrong ones', async () => {
    const stored = await service.hash('correct horse');
    expect(await service.verify(stored, 'correct horse')).toBe(true);
    expect(await service.verify(stored, 'Correct horse')).toBe(false);
    expect(await service.verify(stored, '')).toBe(false);
  });

  it('verifies hashes produced by the seed (@node-rs/argon2 defaults)', async () => {
    expect(await service.verify(await hash('party-finder-dev'), 'party-finder-dev')).toBe(true);
  });

  it('treats a malformed stored hash as a failed verification instead of throwing', async () => {
    expect(await service.verify('not-a-hash', 'x')).toBe(false);
    expect(await service.verify('', 'x')).toBe(false);
  });

  it('verifyDummy burns a real verification and always returns false', async () => {
    const started = performance.now();
    expect(await service.verifyDummy('whatever')).toBe(false);
    expect(performance.now() - started).toBeGreaterThan(5);
  });
});
