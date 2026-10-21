import { z } from 'zod';

export const resumeIdParams = z.object({
  resumeId: z.string().uuid('That resume id is not valid.'),
});

export const analysisIdParams = z.object({
  analysisId: z.string().uuid('That report id is not valid.'),
});

export const sessionIdParams = z.object({
  sessionId: z.string().uuid('That interview id is not valid.'),
});
