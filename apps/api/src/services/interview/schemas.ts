import { z } from 'zod';
import { ANSWER_FORMATS, DIFFICULTIES } from '@career-prep/shared';

/**
 * A generated question, including the parts that must never leave the server.
 * `gradingMetadata` is split out when the question is persisted so that the
 * public shape physically cannot carry the answer key.
 */
export const generatedQuestionSchema = z
  .object({
    questionText: z.string().trim().min(10).max(1800),
    topic: z.string().trim().min(2).max(120),
    difficulty: z.enum(DIFFICULTIES),
    answerFormat: z.enum(ANSWER_FORMATS),
    /** Exactly four options for a multiple-choice question, otherwise empty. */
    options: z.array(z.string().trim().min(1).max(300)).max(4).default([]),
    /** Index into `options`. Server side only. */
    correctOptionIndex: z.number().int().min(0).max(3).nullable().default(null),
    /** Model answer or expected result. Server side only. */
    expectedAnswer: z.string().trim().min(1).max(2500),
    /** What a good answer must contain. Server side only. */
    rubric: z.array(z.string().trim().min(1).max(400)).min(1).max(8),
    /** Shown only on request, never contains the answer. */
    hint: z.string().trim().max(400).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.answerFormat === 'MULTIPLE_CHOICE') {
      if (value.options.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'A multiple-choice question needs exactly four options',
        });
      }
      if (value.correctOptionIndex === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctOptionIndex'],
          message: 'A multiple-choice question needs a correct option index',
        });
      }
    } else if (value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'A free-text question must not carry options',
      });
    }
  });

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const generatedQuestionsSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(15),
});

/** Shape stored in `InterviewQuestion.gradingMetadata`. */
export const gradingMetadataSchema = z.object({
  expectedAnswer: z.string(),
  rubric: z.array(z.string()),
  correctOptionIndex: z.number().int().nullable(),
  evaluationCriteria: z.array(z.string()),
});

export type GradingMetadata = z.infer<typeof gradingMetadataSchema>;
