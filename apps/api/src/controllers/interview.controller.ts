import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  interviewSummarySchema,
  parsedResumeSchema,
  storedEvaluationSchema,
  type CreateInterviewInput,
  type InterviewAnswerRecord,
  type InterviewSessionDetail,
  type InterviewSessionSummary,
  type PublicInterviewQuestion,
  type SubmitAnswerInput,
} from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { AppError, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getProfile } from '../repositories/profile.repository.js';
import { latestCompletedResume } from '../repositories/resume.repository.js';
import {
  abandonSession,
  appendQuestions,
  completeSession,
  createSessionWithQuestions,
  findQuestionForUser,
  findSessionForUser,
  listSessionsForUser,
  saveAnswer,
} from '../repositories/interview.repository.js';
import { assertSessionQuota } from '../services/llm/index.js';
import { MODE_CONFIG } from '../services/interview/modes.js';
import { generateQuestions } from '../services/interview/questions.service.js';
import {
  evaluateAnswer,
  generateSummary,
  gradeObjectiveAnswer,
} from '../services/interview/evaluation.service.js';
import { gradingMetadataSchema } from '../services/interview/schemas.js';

type SessionRow = NonNullable<Awaited<ReturnType<typeof findSessionForUser>>>;
type QuestionRow = SessionRow['questions'][number];

/** Strips grading metadata. This is the only shape sent to the browser. */
function toPublicQuestion(row: QuestionRow): PublicInterviewQuestion {
  return {
    id: row.id,
    questionOrder: row.questionOrder,
    questionText: row.questionText,
    topic: row.topic,
    difficulty: row.difficulty,
    answerFormat: row.answerFormat,
    options: row.answerFormat === 'MULTIPLE_CHOICE' ? row.options : null,
    hint: row.hint,
    source: row.source,
    answered: row.answer !== null,
  };
}

function toAnswerRecord(row: NonNullable<QuestionRow['answer']>): InterviewAnswerRecord {
  const parsed = storedEvaluationSchema.safeParse(row.evaluationData);
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'That feedback could not be loaded.', {
      logContext: { answerId: row.id, reason: 'stored_evaluation_invalid' },
    });
  }

  return {
    id: row.id,
    questionId: row.questionId,
    answerText: row.answerText,
    selectedOptionIndex: row.selectedOptionIndex,
    overallScore: row.overallScore,
    evaluation: parsed.data,
    submittedAt: row.submittedAt.toISOString(),
  };
}

function toSessionSummary(row: {
  id: string;
  mode: SessionRow['mode'];
  targetRole: string;
  experienceLevel: SessionRow['experienceLevel'];
  difficulty: SessionRow['difficulty'];
  status: SessionRow['status'];
  totalQuestions: number;
  completedQuestions: number;
  averageScore: number | null;
  createdAt: Date;
  completedAt: Date | null;
}): InterviewSessionSummary {
  return {
    id: row.id,
    mode: row.mode,
    targetRole: row.targetRole,
    experienceLevel: row.experienceLevel,
    difficulty: row.difficulty,
    status: row.status,
    totalQuestions: row.totalQuestions,
    completedQuestions: row.completedQuestions,
    averageScore: row.averageScore,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function toSessionDetail(row: SessionRow): InterviewSessionDetail {
  const summary = row.finalSummary ? interviewSummarySchema.safeParse(row.finalSummary) : null;

  return {
    ...toSessionSummary(row),
    questions: row.questions.map(toPublicQuestion),
    answers: row.questions
      .filter((question): question is QuestionRow & { answer: NonNullable<QuestionRow['answer']> } =>
        question.answer !== null,
      )
      .map((question) => toAnswerRecord(question.answer)),
    finalSummary: summary?.success ? summary.data : null,
  };
}

/** A short, non-identifying digest of the resume used to make questions relevant. */
function resumeHighlights(resume: { extractedText: string; parsedData: unknown } | null): string {
  if (!resume) return '';
  const parsed = parsedResumeSchema.safeParse(resume.parsedData);
  if (!parsed.success) return '';

  const data = parsed.data;
  // Contact details are deliberately excluded: the model does not need them.
  return [
    data.summary ? `Summary: ${data.summary}` : '',
    data.skills.length > 0 ? `Skills: ${data.skills.slice(0, 40).join(', ')}` : '',
    data.workExperience.length > 0
      ? `Experience: ${data.workExperience.slice(0, 6).join(' | ')}`
      : '',
    data.projects.length > 0 ? `Projects: ${data.projects.slice(0, 6).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Generates the first batch. Short sessions are generated in full up front. */
const FIRST_BATCH_SIZE = 5;

export async function createInterview(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const body = req.body as CreateInterviewInput;

  await assertSessionQuota(userId);

  const [profile, resume] = await Promise.all([
    getProfile(userId),
    latestCompletedResume(userId),
  ]);

  const batchSize = Math.min(body.totalQuestions, FIRST_BATCH_SIZE);
  const generated = await generateQuestions(userId, {
    mode: body.mode,
    targetRole: body.targetRole,
    experienceLevel: body.experienceLevel,
    difficulty: body.difficulty,
    count: batchSize,
    resumeHighlights: resumeHighlights(resume),
    profileSkills: profile?.skills ?? [],
    usedTopics: [],
    seed: `${userId}:${body.mode}:${Date.now()}`,
  });

  const session = await createSessionWithQuestions({
    userId,
    mode: body.mode,
    targetRole: body.targetRole,
    experienceLevel: body.experienceLevel,
    difficulty: body.difficulty,
    totalQuestions: body.totalQuestions,
    questions: generated.questions,
    source: generated.source,
    evaluationCriteria: MODE_CONFIG[body.mode].evaluationCriteria,
  });

  logger.info(
    { userId, sessionId: session.id, mode: body.mode, source: generated.source },
    'Interview session created',
  );

  sendSuccess(
    res,
    { session: toSessionDetail(session) },
    generated.source === 'AI_GENERATED'
      ? 'Your interview is ready.'
      : 'Your interview is ready, using our curated practice questions.',
    201,
  );
}

export async function listInterviews(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const rows = await listSessionsForUser(userId);
  sendSuccess(res, { sessions: rows.map(toSessionSummary) });
}

export async function getInterview(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const row = await findSessionForUser(userId, req.params.sessionId as string);
  if (!row) throw notFound('That interview could not be found.');
  sendSuccess(res, { session: toSessionDetail(row) });
}

/**
 * Generates the next question on demand, so a 15-question session does not pay
 * for 15 questions the candidate may never reach.
 */
export async function nextQuestion(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const sessionId = req.params.sessionId as string;

  const session = await findSessionForUser(userId, sessionId);
  if (!session) throw notFound('That interview could not be found.');
  if (session.status !== 'IN_PROGRESS') {
    throw new AppError('CONFLICT', 'This interview has already been completed.');
  }

  const unanswered = session.questions.find((question) => question.answer === null);
  if (unanswered) {
    sendSuccess(res, { question: toPublicQuestion(unanswered), generated: false });
    return;
  }

  if (session.questions.length >= session.totalQuestions) {
    throw new AppError(
      'CONFLICT',
      'You have answered every question. Finish the interview to see your summary.',
    );
  }

  const [profile, resume] = await Promise.all([
    getProfile(userId),
    latestCompletedResume(userId),
  ]);

  const remaining = session.totalQuestions - session.questions.length;
  const generated = await generateQuestions(userId, {
    mode: session.mode,
    targetRole: session.targetRole,
    experienceLevel: session.experienceLevel,
    difficulty: session.difficulty,
    count: Math.min(remaining, FIRST_BATCH_SIZE),
    resumeHighlights: resumeHighlights(resume),
    profileSkills: profile?.skills ?? [],
    usedTopics: session.questions.map((question) => question.topic),
    seed: `${userId}:${session.id}:${session.questions.length}`,
  });

  if (generated.questions.length === 0) {
    throw new AppError(
      'AI_UNAVAILABLE',
      'We could not prepare another question right now. Finish the interview or try again shortly.',
    );
  }

  const created = await appendQuestions({
    sessionId: session.id,
    startOrder: session.questions.length + 1,
    questions: generated.questions,
    source: generated.source,
    evaluationCriteria: MODE_CONFIG[session.mode].evaluationCriteria,
  });

  const first = created[0];
  if (!first) throw new AppError('AI_UNAVAILABLE', 'We could not prepare another question.');

  sendSuccess(res, {
    question: toPublicQuestion({ ...first, answer: null }),
    generated: true,
  });
}

export async function submitAnswer(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const sessionId = req.params.sessionId as string;
  const body = req.body as SubmitAnswerInput;

  const question = await findQuestionForUser(userId, sessionId, body.questionId);
  if (!question) throw notFound('That question could not be found.');

  if (question.session.status !== 'IN_PROGRESS') {
    throw new AppError('CONFLICT', 'This interview has already been completed.');
  }

  // Idempotency: the same key re-submitted returns the stored evaluation.
  if (question.answer) {
    const sameRequest =
      body.idempotencyKey !== undefined &&
      question.answer.idempotencyKey === body.idempotencyKey;

    if (sameRequest) {
      sendSuccess(res, { answer: toAnswerRecord(question.answer), duplicate: true });
      return;
    }
    throw new AppError('CONFLICT', 'You have already answered this question.');
  }

  const grading = gradingMetadataSchema.safeParse(question.gradingMetadata);
  if (!grading.success) {
    throw new AppError('INTERNAL_ERROR', 'That question could not be graded. Please start a new interview.', {
      logContext: { questionId: question.id, reason: 'grading_metadata_invalid' },
    });
  }

  const selectedOptionIndex =
    question.answerFormat === 'MULTIPLE_CHOICE' ? (body.selectedOptionIndex ?? null) : null;

  if (question.answerFormat === 'MULTIPLE_CHOICE' && selectedOptionIndex === null) {
    throw new AppError('VALIDATION_ERROR', 'Choose one of the options before submitting.');
  }
  if (selectedOptionIndex !== null && selectedOptionIndex >= question.options.length) {
    throw new AppError('VALIDATION_ERROR', 'That option does not exist for this question.');
  }

  const objectiveResult = gradeObjectiveAnswer(
    grading.data,
    question.options,
    selectedOptionIndex,
  );

  const { evaluation, source } = await evaluateAnswer(userId, {
    mode: question.session.mode,
    targetRole: question.session.targetRole,
    experienceLevel: question.session.experienceLevel,
    difficulty: question.difficulty,
    questionText: question.questionText,
    grading: grading.data,
    answerText: body.answerText,
    objectiveResult,
  });

  try {
    const answer = await saveAnswer({
      sessionId,
      questionId: question.id,
      answerText: body.answerText,
      selectedOptionIndex,
      evaluation,
      idempotencyKey: body.idempotencyKey ?? null,
    });

    logger.info({ userId, sessionId, questionId: question.id, source }, 'Answer evaluated');
    sendSuccess(
      res,
      { answer: toAnswerRecord({ ...answer, questionId: question.id }), duplicate: false },
      'Feedback ready.',
      201,
    );
  } catch (error) {
    // Two requests raced: the unique constraint means only one evaluation sticks.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fresh = await findQuestionForUser(userId, sessionId, body.questionId);
      if (fresh?.answer) {
        sendSuccess(res, { answer: toAnswerRecord(fresh.answer), duplicate: true });
        return;
      }
    }
    throw error;
  }
}

export async function complete(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const sessionId = req.params.sessionId as string;

  const session = await findSessionForUser(userId, sessionId);
  if (!session) throw notFound('That interview could not be found.');

  if (session.status === 'COMPLETED') {
    sendSuccess(res, { session: toSessionDetail(session) }, 'This interview is already complete.');
    return;
  }

  const answers = session.questions
    .filter((question) => question.answer !== null)
    .map((question) => ({ question, answer: question.answer }));

  if (answers.length === 0) {
    // Nothing to summarise: mark it abandoned rather than inventing a report.
    const abandoned = await abandonSession(session.id);
    const refreshed = await findSessionForUser(userId, abandoned.id);
    sendSuccess(
      res,
      { session: refreshed ? toSessionDetail(refreshed) : null },
      'Interview closed. No answers were submitted, so there is no report.',
    );
    return;
  }

  const perAnswer = answers.map(({ question, answer }) => {
    const evaluation = storedEvaluationSchema.safeParse(answer?.evaluationData);
    return {
      topic: question.topic,
      overallScore: answer?.overallScore ?? 0,
      summary: evaluation.success ? evaluation.data.summary : 'Feedback unavailable.',
      weaknesses: evaluation.success
        ? evaluation.data.weaknesses.map((item) => item.title)
        : [],
      strengths: evaluation.success ? evaluation.data.strengths.map((item) => item.title) : [],
    };
  });

  const averageScore = Math.round(
    perAnswer.reduce((total, item) => total + item.overallScore, 0) / perAnswer.length,
  );

  const { summary, source } = await generateSummary(userId, {
    mode: session.mode,
    targetRole: session.targetRole,
    experienceLevel: session.experienceLevel,
    averageScore,
    answered: perAnswer.length,
    total: session.totalQuestions,
    perAnswer,
  });

  await completeSession({ sessionId: session.id, summary, status: 'COMPLETED' });
  const refreshed = await findSessionForUser(userId, session.id);

  logger.info({ userId, sessionId, source, averageScore }, 'Interview completed');
  sendSuccess(
    res,
    { session: refreshed ? toSessionDetail(refreshed) : null },
    'Your interview report is ready.',
  );
}

export async function getReport(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const row = await findSessionForUser(userId, req.params.sessionId as string);
  if (!row) throw notFound('That interview could not be found.');

  if (row.status === 'IN_PROGRESS') {
    throw new AppError(
      'CONFLICT',
      'This interview is still in progress. Finish it to generate the report.',
    );
  }

  sendSuccess(res, { session: toSessionDetail(row) });
}
