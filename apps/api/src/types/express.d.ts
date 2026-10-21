import type { AuthSession, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by `requireAuth` from the session cookie only. There is no code path
       * that reads a user id from the request body, query or a header.
       */
      authUser?: Pick<User, 'id' | 'name' | 'email' | 'createdAt'>;
      authSession?: Pick<AuthSession, 'id' | 'csrfSecret' | 'expiresAt'>;
      requestId?: string;
    }
  }
}

export {};
