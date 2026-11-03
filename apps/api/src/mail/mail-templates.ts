import { VERIFICATION_TOKEN_TTL_HOURS } from '@party-finder/shared';
import type { MailMessage } from './mail-sender';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapHtml(body: string): string {
  return `<!doctype html><html lang="es"><body style="font-family:sans-serif;line-height:1.5;color:#222">${body}</body></html>`;
}

export function verificationEmail(to: string, username: string, link: string): MailMessage {
  const name = escapeHtml(username);
  const href = escapeHtml(link);
  return {
    to,
    subject: 'Verifica tu correo electrónico',
    text: [
      `Hola ${username},`,
      '',
      'Gracias por registrarte. Para activar tu cuenta abre este enlace:',
      link,
      '',
      `El enlace caduca en ${VERIFICATION_TOKEN_TTL_HOURS} horas y solo se puede usar una vez.`,
      'Si no has sido tú, ignora este mensaje.',
    ].join('\n'),
    html: wrapHtml(
      `<p>Hola ${name},</p>` +
        '<p>Gracias por registrarte. Para activar tu cuenta pulsa el siguiente botón:</p>' +
        `<p><a href="${href}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Verificar mi correo</a></p>` +
        `<p>Si el botón no funciona, copia este enlace en tu navegador:<br>${href}</p>` +
        `<p>El enlace caduca en ${VERIFICATION_TOKEN_TTL_HOURS} horas y solo se puede usar una vez. Si no has sido tú, ignora este mensaje.</p>`,
    ),
  };
}

/** Sent instead of a verification link when someone registers with an email that has an account. */
export function alreadyRegisteredEmail(
  to: string,
  username: string,
  loginUrl: string,
): MailMessage {
  const name = escapeHtml(username);
  const href = escapeHtml(loginUrl);
  return {
    to,
    subject: 'Ya tienes una cuenta',
    text: [
      `Hola ${username},`,
      '',
      'Alguien ha intentado registrarse con este correo electrónico, pero ya tienes una cuenta.',
      `Puedes iniciar sesión en: ${loginUrl}`,
      '',
      'Si no has sido tú, ignora este mensaje: tu cuenta sigue segura.',
    ].join('\n'),
    html: wrapHtml(
      `<p>Hola ${name},</p>` +
        '<p>Alguien ha intentado registrarse con este correo electrónico, pero <strong>ya tienes una cuenta</strong>.</p>' +
        `<p>Puedes iniciar sesión aquí: <a href="${href}">${href}</a></p>` +
        '<p>Si no has sido tú, ignora este mensaje: tu cuenta sigue segura.</p>',
    ),
  };
}
