import { Router } from 'express';
import {
  analyzeResumeFitSchema,
  analyzeSkillGapSchema,
  changePasswordSchema,
  createInterviewSchema,
  loginSchema,
  profileInputSchema,
  registerSchema,
  submitAnswerSchema,
  updateResumeSchema,
} from '@career-prep/shared';
import { asyncHandler } from '../utils/http.js';
import { requireAuth, requireCsrf } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.middleware.js';
import { aiLimiter, authLimiter, uploadLimiter } from '../middleware/rateLimit.middleware.js';
import { requestTimeout } from '../middleware/timeout.middleware.js';
import { resumeUpload } from '../middleware/upload.middleware.js';
import { analysisIdParams, resumeIdParams, sessionIdParams } from '../validators/params.js';
import * as auth from '../controllers/auth.controller.js';
import * as profile from '../controllers/profile.controller.js';
import * as resume from '../controllers/resume.controller.js';
import * as skillGap from '../controllers/skillGap.controller.js';
import * as resumeFit from '../controllers/resumeFit.controller.js';
import * as interview from '../controllers/interview.controller.js';
import * as dashboard from '../controllers/dashboard.controller.js';

/** AI-backed routes get a longer budget than ordinary CRUD. */
const AI_TIMEOUT_MS = 150_000;
const STANDARD_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

export const apiRouter: Router = Router();

/* --- Authentication ------------------------------------------------------ */

const authRouter = Router();
authRouter.post('/register', authLimiter, validateBody(registerSchema), asyncHandler(auth.register));
authRouter.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(auth.login));
// Logout needs the session (to delete the right row) and the CSRF token.
authRouter.post('/logout', asyncHandler(requireAuth), requireCsrf, asyncHandler(auth.logout));
authRouter.get('/me', asyncHandler(requireAuth), asyncHandler(auth.me));
authRouter.put(
  '/password',
  authLimiter,
  asyncHandler(requireAuth),
  requireCsrf,
  validateBody(changePasswordSchema),
  asyncHandler(auth.updatePassword),
);
authRouter.delete(
  '/account',
  asyncHandler(requireAuth),
  requireCsrf,
  asyncHandler(auth.deleteAccount),
);
apiRouter.use('/auth', authRouter);

/* --- Everything below requires a session --------------------------------- */

const secure = Router();
secure.use(asyncHandler(requireAuth), requireCsrf);

secure.get('/profile', requestTimeout(STANDARD_TIMEOUT_MS), asyncHandler(profile.readProfile));
secure.put(
  '/profile',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateBody(profileInputSchema),
  asyncHandler(profile.writeProfile),
);

secure.get('/dashboard', requestTimeout(STANDARD_TIMEOUT_MS), asyncHandler(dashboard.getDashboard));

/* --- Resumes ------------------------------------------------------------- */

secure.post(
  '/resumes/upload',
  uploadLimiter,
  requestTimeout(UPLOAD_TIMEOUT_MS),
  resumeUpload,
  asyncHandler(resume.uploadResume),
);
secure.get('/resumes', requestTimeout(STANDARD_TIMEOUT_MS), asyncHandler(resume.listResumes));
secure.get(
  '/resumes/:resumeId',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(resumeIdParams),
  asyncHandler(resume.getResume),
);
secure.put(
  '/resumes/:resumeId',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(resumeIdParams),
  validateBody(updateResumeSchema),
  asyncHandler(resume.patchResume),
);
secure.post(
  '/resumes/:resumeId/reparse',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(resumeIdParams),
  asyncHandler(resume.reparseResume),
);

// Resume fit: "how well does this resume match this role?"
secure.post(
  '/resumes/:resumeId/fit',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateParams(resumeIdParams),
  validateBody(analyzeResumeFitSchema),
  asyncHandler(resumeFit.analyzeFit),
);
secure.get(
  '/resumes/:resumeId/fit',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(resumeIdParams),
  asyncHandler(resumeFit.getLatestFit),
);

secure.delete(
  '/resumes/:resumeId',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(resumeIdParams),
  asyncHandler(resume.removeResume),
);

/* --- Skill gap analysis -------------------------------------------------- */

secure.post(
  '/skill-gap/analyze',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateBody(analyzeSkillGapSchema),
  asyncHandler(skillGap.analyze),
);
secure.get('/skill-gap/history', requestTimeout(STANDARD_TIMEOUT_MS), asyncHandler(skillGap.history));
secure.get(
  '/skill-gap/:analysisId',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(analysisIdParams),
  asyncHandler(skillGap.getAnalysis),
);

/* --- Interviews ---------------------------------------------------------- */

secure.post(
  '/interviews',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateBody(createInterviewSchema),
  asyncHandler(interview.createInterview),
);
secure.get('/interviews', requestTimeout(STANDARD_TIMEOUT_MS), asyncHandler(interview.listInterviews));
secure.get(
  '/interviews/:sessionId',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(sessionIdParams),
  asyncHandler(interview.getInterview),
);
secure.post(
  '/interviews/:sessionId/next-question',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateParams(sessionIdParams),
  asyncHandler(interview.nextQuestion),
);
secure.post(
  '/interviews/:sessionId/answer',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateParams(sessionIdParams),
  validateBody(submitAnswerSchema),
  asyncHandler(interview.submitAnswer),
);
secure.post(
  '/interviews/:sessionId/complete',
  aiLimiter,
  requestTimeout(AI_TIMEOUT_MS),
  validateParams(sessionIdParams),
  asyncHandler(interview.complete),
);
secure.get(
  '/interviews/:sessionId/report',
  requestTimeout(STANDARD_TIMEOUT_MS),
  validateParams(sessionIdParams),
  asyncHandler(interview.getReport),
);

apiRouter.use(secure);
