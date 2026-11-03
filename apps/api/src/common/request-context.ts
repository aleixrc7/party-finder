export interface SessionData {
  /** `null` for an anonymous session (it only carries the CSRF token). */
  userId: string | null;
  username: string | null;
  csrf: string;
}

export interface RequestSession extends SessionData {
  id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by SessionGuard when the cookie maps to a live session. */
    appSession?: RequestSession;
  }
}

export interface AuthenticatedUser {
  id: string;
  username: string;
}
