import type { CaptchaVerifier } from '../../src/auth/captcha';
import type { MailMessage, MailSender } from '../../src/mail/mail-sender';
import type { ObjectStorage } from '../../src/uploads/object-storage';

/** Captures every email instead of sending it. */
export class FakeMailSender implements MailSender {
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;

  send(message: MailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }

  to(email: string): MailMessage[] {
    return this.sent.filter((m) => m.to === email);
  }

  /** The verification token carried by the last email sent to `email`, or null if it had no link. */
  lastToken(email: string): string | null {
    const last = this.to(email).at(-1);
    const match = last ? /verificar-email\?token=([A-Za-z0-9_-]+)/.exec(last.text) : null;
    return match?.[1] ?? null;
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Accepts every token except the literal string `bad-captcha`. */
export class FakeCaptcha implements CaptchaVerifier {
  verify(token: string): Promise<boolean> {
    return Promise.resolve(token !== 'bad-captcha');
  }
}

export class FakeStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  constructor(private readonly publicBase: string) {}

  put(key: string, body: Buffer, contentType: string): Promise<string> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve(`${this.publicBase}/${key}`);
  }
}
