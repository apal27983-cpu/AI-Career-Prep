import { z } from 'zod';
import { INTERVIEW_MODES, type InterviewMode } from '../constants.js';

const feedbackPoint = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(900),
});

const improvementPoint = feedbackPoint.extend({
  actionableStep: z.string().trim().min(1).max(600),
});

/** Score dimensions each mode is graded on. Every dimension is scored 1-5. */
export const MODE_SCORE_DIMENSIONS = {
  TECHNICAL: ['technicalAccuracy', 'reasoning', 'completeness', 'practicalApplicability'],
  NON_TECHNICAL: ['relevance', 'communication', 'problemSolving', 'professionalJudgement'],
  APTITUDE: ['correctness', 'reasoning', 'calculationAccuracy', 'methodEfficiency'],
  HR: ['relevance', 'specificity', 'behaviouralEvidence', 'structureAndClarity'],
} as const satisfies Record<InterviewMode, readonly string[]>;

export const SCORE_DIMENSION_LABELS: Record<string, string> = {
  technicalAccuracy: 'Technical accuracy',
  reasoning: 'Reasoning',
  completeness: 'Completeness',
  practicalApplicability: 'Practical applicability',
  relevance: 'Relevance',
  communication: 'Communication',
  problemSolving: 'Problem solving',
  professionalJudgement: 'Professional judgement',
  correctness: 'Correctness',
  calculationAccuracy: 'Calculation accuracy',
  methodEfficiency: 'Method efficiency',
  specificity: 'Specificity',
  behaviouralEvidence: 'Behavioural evidence',
  structureAndClarity: 'Structure and clarity',
};

const dimensionScore = z.number().int().min(1).max(5);

/**
 * Builds the exact evaluation schema for one mode, so the model cannot return HR
 * dimensions for a technical answer, or quietly omit one.
 */
function buildEvaluationSchema(mode: InterviewMode) {
  const dimensions = MODE_SCORE_DIMENSIONS[mode];
  const shape = Object.fromEntries(dimensions.map((key) => [key, dimensionScore])) as Record<
    string,
    typeof dimensionScore
  >;

  return z.object({
    strengths: z.array(feedbackPoint).max(6),
    weaknesses: z.array(feedbackPoint).max(6),
    suggestedImprovements: z.array(improvementPoint).min(1).max(6),
    scores: z.object(shape).strict(),
    /** 0-100. Recomputed server side from `scores`, so a bad value cannot stick. */
    overallScore: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1).max(1200),
    /** True when the answer was too short or ambiguous to grade properly. */
    insufficientAnswer: z.boolean().default(false),
    /** Explains what stopped a full evaluation, when applicable. */
    evaluationLimitation: z.string().trim().max(600).nullable().default(null),
  });
}

const modeSchemas = new Map<InterviewMode, ReturnType<typeof buildEvaluationSchema>>();

/**
 * One stable schema object per mode. Memoised deliberately: callers cache
 * derived artefacts (such as the JSON Schema sent to a model) against the schema
 * object itself, which only works if the same mode always yields the same object.
 */
export function evaluationSchemaForMode(mode: InterviewMode) {
  let cached = modeSchemas.get(mode);
  if (!cached) {
    cached = buildEvaluationSchema(mode);
    modeSchemas.set(mode, cached);
  }
  return cached;
}

/** Permissive version used when reading an evaluation back out of the database. */
export const storedEvaluationSchema = z.object({
  strengths: z.array(feedbackPoint),
  weaknesses: z.array(feedbackPoint),
  suggestedImprovements: z.array(improvementPoint),
  scores: z.record(z.string(), z.number()),
  overallScore: z.number(),
  summary: z.string(),
  insufficientAnswer: z.boolean().default(false),
  evaluationLimitation: z.string().nullable().default(null),
  /** Deterministic correctness result for objective aptitude questions. */
  objectiveResult: z
    .object({
      isCorrect: z.boolean(),
      expectedAnswer: z.string(),
      explanation: z.string(),
    })
    .nullable()
    .default(null),
  generatedBy: z
    .enum(['AI_GENERATED', 'DETERMINISTIC', 'CURATED_FALLBACK'])
    .default('AI_GENERATED'),
});

export type AnswerEvaluation = z.infer<typeof storedEvaluationSchema>;

export const interviewSummarySchema = z.object({
  headline: z.string().trim().min(1).max(200),
  overallAssessment: z.string().trim().min(1).max(2000),
  topStrengths: z.array(z.string().trim().min(1).max(300)).max(6),
  focusAreas: z.array(z.string().trim().min(1).max(300)).max(6),
  recommendedNextSteps: z.array(z.string().trim().min(1).max(300)).max(6),
});

export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

export const ALL_MODES: readonly InterviewMode[] = INTERVIEW_MODES;
