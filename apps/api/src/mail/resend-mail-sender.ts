import type { Env } from '../config/env';
import type { MailMessage, MailSender } from './mail-sender';

/**
 * Production provider (`MAIL_TRANSPORT=resend`): Resend's HTTP API through `fetch`, so no SDK
 * dependency is needed. The API key is read from `MAIL_PROVIDER_API_KEY`.
 */
export class ResendMailSender implements MailSender {
  constructor(private readonly env: Env) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.MAIL_PROVIDER_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Status only: the response and request bodies may contain the link.
      throw new Error(`Mail provider answered HTTP ${response.status}`);
    }
  }
}
