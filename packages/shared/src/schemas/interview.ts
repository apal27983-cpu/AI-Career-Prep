import { z } from 'zod';
import {
  ANSWER_FORMATS,
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  INTERVIEW_MODES,
  LIMITS,
  QUESTION_COUNT_OPTIONS,
  QUESTION_SOURCES,
  SESSION_STATUSES,
  type AnswerFormat,
  type Difficulty,
  type ExperienceLevel,
  type InterviewMode,
  type QuestionSource,
  type SessionStatus,
} from '../constants.js';
import type { AnswerEvaluation, InterviewSummary } from './evaluation.js';

const allowedCounts = QUESTION_COUNT_OPTIONS as readonly number[];

export const createInterviewSchema = z.object({
  mode: z.enum(INTERVIEW_MODES, { message: 'Choose an interview mode' }),
  targetRole: z
    .string()
    .trim()
    .min(2, 'Enter the role you are preparing for')
    .max(LIMITS.targetRoleMax, 'This is too long'),
  experienceLevel: z.enum(EXPERIENCE_LEVELS, { message: 'Select your experience level' }),
  difficulty: z.enum(DIFFICULTIES, { message: 'Select a difficulty' }),
  totalQuestions: z
    .number({ message: 'Choose how many questions' })
    .int()
    .refine((value) => allowedCounts.includes(value), 'Choose 5, 10 or 15 questions'),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Unknown question'),
  answerText: z
    .string()
    .trim()
    .min(LIMITS.answerMin, 'Write an answer before submitting')
    .max(LIMITS.answerMax, 'Answer is too long'),
  /** Index into the options array, for multiple-choice questions. */
  selectedOptionIndex: z.number().int().min(0).max(9).optional().nullable(),
  /** Client key that makes a resubmission a no-op instead of a duplicate evaluation. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

/**
 * A question as the browser sees it. Grading metadata (expected answer, rubric,
 * correct option index) is deliberately absent from this shape.
 */
export interface PublicInterviewQuestion {
  id: string;
  questionOrder: number;
  questionText: string;
  topic: string;
  difficulty: Difficulty;
  answerFormat: AnswerFormat;
  options: string[] | null;
  hint: string | null;
  source: QuestionSource;
  answered: boolean;
}

export interface InterviewAnswerRecord {
  id: string;
  questionId: string;
  answerText: string;
  selectedOptionIndex: number | null;
  overallScore: number;
  evaluation: AnswerEvaluation;
  submittedAt: string;
}

export interface InterviewSessionSummary {
  id: string;
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  difficulty: Difficulty;
  status: SessionStatus;
  totalQuestions: number;
  completedQuestions: number;
  averageScore: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface InterviewSessionDetail extends InterviewSessionSummary {
  questions: PublicInterviewQuestion[];
  answers: InterviewAnswerRecord[];
  finalSummary: InterviewSummary | null;
}

export const QUESTION_COUNTS: readonly number[] = allowedCounts;
export const ANSWER_FORMAT_VALUES: readonly AnswerFormat[] = ANSWER_FORMATS;
export const SESSION_STATUS_VALUES: readonly SessionStatus[] = SESSION_STATUSES;
export const QUESTION_SOURCE_VALUES: readonly QuestionSource[] = QUESTION_SOURCES;
