import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id through `@node-rs/argon2`. Its defaults are Argon2id v1.3 with m=19 MiB, t=2, p=1
 * (the OWASP minimum), which is what the seed also uses. Hashes are standard PHC strings.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(24).toString('base64url'));
  }

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Verifies against a throwaway hash so an unknown username costs the same time as a wrong
   * password (response time must not reveal whether the user exists). Always returns false.
   */
  async verifyDummy(password: string): Promise<false> {
    if (!this.dummyHash) this.dummyHash = await hash(randomBytes(24).toString('base64url'));
    await this.verify(this.dummyHash, password);
    return false;
  }
}
