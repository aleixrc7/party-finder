import { VERIFY_EMAIL_WEB_PATH } from '@party-finder/shared';

export const routes = {
  calendar: '/',
  events: '/eventos',
  login: '/identificarse',
  register: '/registro',
  verifyEmail: VERIFY_EMAIL_WEB_PATH,
} as const;
