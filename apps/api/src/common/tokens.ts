/** Injection tokens. Providers are always injected explicitly (no decorator metadata). */
export const ENV = Symbol('ENV');
export const REDIS = Symbol('REDIS');
export const LOGGER = Symbol('LOGGER');
export const OVERRIDES = Symbol('OVERRIDES');
export const MAIL_SENDER = Symbol('MAIL_SENDER');
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
