import type { Logger } from 'pino';
import type { Env } from '../config/env';

export interface CaptchaVerifier {
  verify(token: string, remoteIp: string): Promise<boolean>;
}

/** Server-side Cloudflare Turnstile verification. Fails closed on any network or API error. */
export class TurnstileVerifier implements CaptchaVerifier {
  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
  ) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    try {
      const form = new URLSearchParams({ secret: this.env.TURNSTILE_SECRET_KEY, response: token });
      if (remoteIp !== 'unknown') form.set('remoteip', remoteIp);
      const response = await fetch(this.env.TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { success?: unknown };
      return data.success === true;
    } catch (error) {
      this.logger.error({ errName: (error as Error).name }, 'Turnstile verification unavailable');
      return false;
    }
  }
}
