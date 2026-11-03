import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import type { MailMessage, MailSender } from './mail-sender';

/** SMTP delivery: Mailpit locally (no credentials, no TLS), any SMTP relay elsewhere. */
export class SmtpMailSender implements MailSender {
  private readonly transporter: Transporter;

  constructor(private readonly env: Env) {
    // Nodemailer resolves `localhost` to ::1 only (no fallback), but Docker publishes Mailpit on
    // 127.0.0.1, so connections to `localhost` would be refused on Windows and macOS.
    const host = env.SMTP_HOST === 'localhost' ? '127.0.0.1' : env.SMTP_HOST;
    this.transporter = nodemailer.createTransport({
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
