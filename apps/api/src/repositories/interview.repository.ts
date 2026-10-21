import type { ContentSource, Prisma, SessionStatus } from '@prisma/client';
import type {
  AnswerEvaluation,
  Difficulty,
  ExperienceLevel,
  InterviewMode,
  InterviewSummary,
} from '@career-prep/shared';
import { prisma } from '../config/prisma.js';
import type { GeneratedQuestion, GradingMetadata } from '../services/interview/schemas.js';

export async function createSessionWithQuestions(input: {
  userId: string;
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  difficulty: Difficulty;
  totalQuestions: number;
  questions: GeneratedQuestion[];
  source: ContentSource;
  evaluationCriteria: string[];
}) {
  return prisma.interviewSession.create({
    data: {
      userId: input.userId,
      mode: input.mode,
      targetRole: input.targetRole,
      experienceLevel: input.experienceLevel,
      difficulty: input.difficulty,
      totalQuestions: input.totalQuestions,
      questions: {
        create: input.questions.map((question, index) => ({
          questionText: question.questionText,
          topic: question.topic,
          difficulty: question.difficulty,
          questionOrder: index + 1,
          answerFormat: question.answerFormat,
          options: question.options,
          hint: question.hint,
          source: input.source,
          gradingMetadata: {
            expectedAnswer: question.expectedAnswer,
            rubric: question.rubric,
            correctOptionIndex: question.correctOptionIndex,
            evaluationCriteria: input.evaluationCriteria,
          } satisfies GradingMetadata as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    include: { questions: { orderBy: { questionOrder: 'asc' }, include: { answer: true } } },
  });
}

/**
 * Loads a session with its questions and answers, scoped to the owner. A
 * session id belonging to another user resolves to null.
 */
export async function findSessionForUser(userId: string, sessionId: string) {
  return prisma.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { questions: { orderBy: { questionOrder: 'asc' }, include: { answer: true } } },
  });
}

export async function listSessionsForUser(userId: string, limit = 50) {
  return prisma.interviewSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Ownership is re-checked here through the session relation, not trusted. */
export async function findQuestionForUser(userId: string, sessionId: string, questionId: string) {
  return prisma.interviewQuestion.findFirst({
    where: { id: questionId, sessionId, session: { userId } },
    include: { answer: true, session: true },
  });
}

export async function appendQuestions(input: {
  sessionId: string;
  startOrder: number;
  questions: GeneratedQuestion[];
  source: ContentSource;
  evaluationCriteria: string[];
}) {
  return prisma.$transaction(
    input.questions.map((question, index) =>
      prisma.interviewQuestion.create({
        data: {
          sessionId: input.sessionId,
          questionText: question.questionText,
          topic: question.topic,
          difficulty: question.difficulty,
          questionOrder: input.startOrder + index,
          answerFormat: question.answerFormat,
          options: question.options,
          hint: question.hint,
          source: input.source,
          gradingMetadata: {
            expectedAnswer: question.expectedAnswer,
            rubric: question.rubric,
            correctOptionIndex: question.correctOptionIndex,
            evaluationCriteria: input.evaluationCriteria,
          } satisfies GradingMetadata as unknown as Prisma.InputJsonValue,
        },
      }),
    ),
  );
}

/**
 * Writes the answer and advances the session counters in one transaction. The
 * unique constraint on questionId is what makes a double submission fail here
 * rather than producing a second evaluation.
 */
export async function saveAnswer(input: {
  sessionId: string;
  questionId: string;
  answerText: string;
  selectedOptionIndex: number | null;
  evaluation: AnswerEvaluation;
  idempotencyKey: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const answer = await tx.interviewAnswer.create({
      data: {
        questionId: input.questionId,
        answerText: input.answerText,
        selectedOptionIndex: input.selectedOptionIndex,
        evaluationData: input.evaluation as unknown as Prisma.InputJsonValue,
        overallScore: input.evaluation.overallScore,
        idempotencyKey: input.idempotencyKey,
      },
    });

    const aggregate = await tx.interviewAnswer.aggregate({
      where: { question: { sessionId: input.sessionId } },
      _avg: { overallScore: true },
      _count: true,
    });

    await tx.interviewSession.update({
      where: { id: input.sessionId },
      data: {
        completedQuestions: aggregate._count,
        averageScore:
          aggregate._avg.overallScore === null ? null : Math.round(aggregate._avg.overallScore),
      },
    });

    return answer;
  });
}

export async function completeSession(input: {
  sessionId: string;
  summary: InterviewSummary;
  status: SessionStatus;
}) {
  return prisma.interviewSession.update({
    where: { id: input.sessionId },
    data: {
      status: input.status,
      finalSummary: input.summary as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

export async function abandonSession(sessionId: string) {
  return prisma.interviewSession.update({
    where: { id: sessionId },
    data: { status: 'ABANDONED', completedAt: new Date() },
  });
}

export async function interviewStats(userId: string) {
  const [completed, inProgress, answers, byMode] = await Promise.all([
    prisma.interviewSession.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.interviewSession.count({ where: { userId, status: 'IN_PROGRESS' } }),
    prisma.interviewAnswer.aggregate({
      where: { question: { session: { userId } } },
      _avg: { overallScore: true },
      _count: true,
    }),
    prisma.interviewSession.groupBy({
      by: ['mode'],
      where: { userId, averageScore: { not: null } },
      _avg: { averageScore: true },
      _count: true,
    }),
  ]);

  return { completed, inProgress, answers, byMode };
}
