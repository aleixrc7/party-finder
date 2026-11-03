/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { describe, expect, it, vi } from 'vitest';
import { MailService } from '../../src/mail/mail.service';
import { createMailSender } from '../../src/mail/mail.module';
import { ResendMailSender } from '../../src/mail/resend-mail-sender';
import { SmtpMailSender } from '../../src/mail/smtp-mail-sender';
import {
  alreadyRegisteredEmail,
  escapeHtml,
  verificationEmail,
} from '../../src/mail/mail-templates';
import type { Env } from '../../src/config/env';
import { FakeMailSender } from '../helpers/fakes';

const env = { WEB_ORIGIN: 'http://localhost:5173/', MAIL_TRANSPORT: 'smtp' } as Env;
const logger = () => ({ error: vi.fn(), info: vi.fn() });

describe('MailService', () => {
  it('builds the link on the web app: {WEB_ORIGIN}/verificar-email?token=...', async () => {
    const sender = new FakeMailSender();
    const service = new MailService(sender, env, logger() as never);
    expect(service.buildVerificationLink('abc_DEF-123')).toBe(
      'http://localhost:5173/verificar-email?token=abc_DEF-123',
    );
    await service.sendVerification('a@example.com', 'ana', 'tok_en-1');
    expect(sender.lastToken('a@example.com')).toBe('tok_en-1');
  });

  it('sends the "already registered" notice without a token link', async () => {
    const sender = new FakeMailSender();
    const service = new MailService(sender, env, logger() as never);
    await service.sendAlreadyRegistered('a@example.com', 'ana');
    const mail = sender.sent[0]!;
    expect(mail.text).not.toContain('token');
    expect(mail.html).not.toContain('token');
    expect(mail.text).toContain('ya tienes una cuenta');
  });

  it('never throws on delivery failure and logs without the message, link or token', async () => {
    const sender = new FakeMailSender();
    sender.failWith = Object.assign(
      new Error('rejected: http://localhost:5173/verificar-email?token=SECRET'),
      {
        code: 'ESOCKET',
      },
    );
    const log = logger();
    const service = new MailService(sender, env, log as never);
    await expect(
      service.sendVerification('a@example.com', 'ana', 'SECRET'),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).toContain('ESOCKET');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('a@example.com');
  });
});

describe('mail templates', () => {
  it('are in Spanish, plain text plus simple HTML, with the link and the 24 h expiry', () => {
    const mail = verificationEmail('a@example.com', 'ana', 'http://x/verificar-email?token=t');
    expect(mail.subject).toBe('Verifica tu correo electrónico');
    expect(mail.text).toContain('http://x/verificar-email?token=t');
    expect(mail.text).toContain('24 horas');
    expect(mail.html).toContain('<a href="http://x/verificar-email?token=t"');
  });

  it('escape user-controlled values in HTML (username)', () => {
    const mail = verificationEmail('a@example.com', '<img src=x onerror=1>', 'http://x/?token=t');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img');
    expect(alreadyRegisteredEmail('a@example.com', '"><script>', 'http://x/').html).not.toContain(
      '<script>',
    );
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('createMailSender', () => {
  const full = {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    MAIL_FROM: 'a <a@b.c>',
  } as Env;

  it('selects the implementation with MAIL_TRANSPORT', () => {
    expect(createMailSender({ ...full, MAIL_TRANSPORT: 'smtp' })).toBeInstanceOf(SmtpMailSender);
    expect(
      createMailSender({ ...full, MAIL_TRANSPORT: 'resend', MAIL_PROVIDER_API_KEY: 'k' }),
    ).toBeInstanceOf(ResendMailSender);
    expect(() => createMailSender({ ...full, MAIL_TRANSPORT: 'carrier-pigeon' })).toThrow(
      /MAIL_TRANSPORT/,
    );
  });

  it('the production sender reports only the HTTP status on failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"link":"SECRET"}', { status: 422 }));
    try {
      const sender = new ResendMailSender({ ...full, MAIL_PROVIDER_API_KEY: 'k' });
      const error = await sender
        .send({ to: 'a@b.c', subject: 's', text: 't', html: 'h' })
        .catch((e: Error) => e);
      expect((error as Error).message).toBe('Mail provider answered HTTP 422');
      const [, init] = fetchSpy.mock.calls[0]!;
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer k');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
