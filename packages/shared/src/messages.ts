/**
 * Exact texts of the auth messages whose wording is part of the contract.
 * The API sends them verbatim and the UI shows them verbatim (the UI is in Spanish).
 * docs/openapi.yaml documents the same texts; a test checks they match.
 *
 * The generic ones must never vary with the input: changing the text depending on
 * whether a username or email exists would leak who is registered.
 */
export const AUTH_MESSAGES = {
  /**
   * 202 of `POST /auth/register` AND `POST /auth/resend-verification`, in every case:
   * new email, already registered email, verified or not, or unknown email.
   */
  VERIFICATION_EMAIL_SENT: 'Si los datos son válidos, recibirás un correo electrónico.',
  /** 200 of `POST /auth/verify-email`. */
  EMAIL_VERIFIED: 'Tu cuenta está verificada. Ya puedes iniciar sesión.',
  /** `message` of `400 INVALID_OR_EXPIRED_TOKEN`. */
  INVALID_OR_EXPIRED_TOKEN: 'El enlace de verificación no es válido o ha caducado.',
  /** `message` of `403 EMAIL_NOT_VERIFIED` on login. */
  EMAIL_NOT_VERIFIED: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
  /** `message` of `401 INVALID_CREDENTIALS` on login, whatever the reason. */
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
} as const;

export type AuthMessage = (typeof AUTH_MESSAGES)[keyof typeof AUTH_MESSAGES];
