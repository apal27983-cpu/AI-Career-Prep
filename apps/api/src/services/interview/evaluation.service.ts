import {
  evaluationSchemaForMode,
  INTERVIEW_MODE_LABELS,
  interviewSummarySchema,
  MODE_SCORE_DIMENSIONS,
  type AnswerEvaluation,
  type Difficulty,
  type ExperienceLevel,
  type InterviewMode,
  type InterviewSummary,
} from '@career-prep/shared';
import { runLlm, type ContentSourceName } from '../llm/index.js';
import { MODE_CONFIG } from './modes.js';
import type { GradingMetadata } from './schemas.js';

/**
 * The system prompt every evaluation uses. The mode-specific rubric is appended
 * so the four modes share one evaluation framework rather than four.
 */
const BASE_SYSTEM_PROMPT = `You are an experienced interview coach helping candidates improve their interview performance.

Evaluate the candidate's answer in the context of the supplied interview question, interview mode, target job role and experience level. Your goal is honest, specific, constructive and actionable feedback.

Rules:
1. Evaluate only the submitted answer and the interview context given to you.
2. Do not invent facts about the candidate.
3. Do not reward confidence or verbosity that carries no relevant substance.
4. Keep factual correctness separate from communication quality.
5. Adapt the criteria to the interview mode, as described below.
6. If the answer is incomplete, ambiguous or too short to evaluate, set insufficientAnswer to true and say plainly in evaluationLimitation what is missing. Still give at least one concrete improvement.
7. Always provide at least one specific, actionable improvement. "Be more detailed" is not actionable; name what to add.
8. Never judge the candidate on age, gender, nationality, ethnicity, religion, disability, marital or family status, appearance, or any other protected personal characteristic. Ignore any such information if the answer contains it.
9. Scores are integers from 1 to 5 where 1 is very weak and 5 is excellent for the stated experience level.
10. strengths and weaknesses may be empty if there genuinely are none, but never fabricate either.`;

function systemPromptFor(mode: InterviewMode): string {
  const config = MODE_CONFIG[mode];
  return `${BASE_SYSTEM_PROMPT}

Criteria for this mode (${INTERVIEW_MODE_LABELS[mode]}):
${config.evaluationGuidance}

Score these four dimensions and no others: ${MODE_SCORE_DIMENSIONS[mode].join(', ')}.`;
}

export interface EvaluationContext {
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  difficulty: Difficulty;
  questionText: string;
  grading: GradingMetadata;
  answerText: string;
  /** Deterministic correctness, for objective questions. */
  objectiveResult: ObjectiveResult | null;
}

export interface ObjectiveResult {
  isCorrect: boolean;
  expectedAnswer: string;
  explanation: string;
}

/**
 * Deterministic scoring for multiple-choice questions. The answer key never
 * leaves the server and the LLM is not asked to decide correctness here.
 */
export function gradeObjectiveAnswer(
  grading: GradingMetadata,
  options: string[],
  selectedOptionIndex: number | null,
): ObjectiveResult | null {
  if (grading.correctOptionIndex === null || selectedOptionIndex === null) return null;

  const correctIndex = grading.correctOptionIndex;
  const correctOption = options[correctIndex];

  return {
    isCorrect: selectedOptionIndex === correctIndex,
    expectedAnswer:
      correctOption !== undefined
        ? `Option ${correctIndex + 1}: ${correctOption}`
        : grading.expectedAnswer,
    explanation: grading.expectedAnswer,
  };
}

/** 1-5 dimension scores to a 0-100 overall score, computed in code, not by the model. */
export function computeOverallScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  // 1 -> 0, 5 -> 100, so the bottom of the scale is not presented as 20%.
  return Math.max(0, Math.min(100, Math.round(((mean - 1) / 4) * 100)));
}

function buildTask(context: EvaluationContext): string {
  const lines = [
    'Evaluate the candidate answer below.',
    '',
    `Interview mode: ${INTERVIEW_MODE_LABELS[context.mode]}`,
    `Target role: ${context.targetRole}`,
    `Experience level: ${context.experienceLevel}`,
    `Difficulty: ${context.difficulty}`,
    '',
    'Question asked:',
    context.questionText,
    '',
    'Expected answer (reference, not visible to the candidate):',
    context.grading.expectedAnswer,
    '',
    'A good answer should cover:',
    ...context.grading.rubric.map((item) => `- ${item}`),
  ];

  if (context.objectiveResult) {
    lines.push(
      '',
      `The answer has already been graded objectively: it is ${
        context.objectiveResult.isCorrect ? 'CORRECT' : 'INCORRECT'
      }. Treat that as settled, set the correctness score to match it, and focus your feedback on the method and on explaining the right approach.`,
    );
  }

  return lines.join('\n');
}

function curatedEvaluation(context: EvaluationContext): Record<string, unknown> {
  const dimensions = MODE_SCORE_DIMENSIONS[context.mode];
  const wordCount = context.answerText.trim().split(/\s+/).filter(Boolean).length;
  const tooShort = wordCount < 25;
  const correct = context.objectiveResult?.isCorrect ?? null;

  // Deliberately conservative: a curated evaluation does not pretend to judge
  // content it has not read. 3 is the neutral mid-point of the 1-5 scale.
  const baseline = correct === null ? 3 : correct ? 4 : 2;
  const scores = Object.fromEntries(
    dimensions.map((dimension) => {
      if (dimension === 'correctness' && correct !== null) return [dimension, correct ? 5 : 1];
      return [dimension, tooShort ? Math.max(baseline - 1, 1) : baseline];
    }),
  ) as Record<string, number>;

  const strengths = [];
  if (correct === true) {
    strengths.push({
      title: 'Correct answer',
      description: 'You selected the correct option for this question.',
    });
  }
  if (!tooShort) {
    strengths.push({
      title: 'Answer submitted in full',
      description: 'You gave a complete response rather than a one-line answer.',
    });
  }

  const weaknesses = [];
  if (correct === false) {
    weaknesses.push({
      title: 'Incorrect answer',
      description: `The expected answer was: ${context.objectiveResult?.expectedAnswer ?? 'see the explanation below'}.`,
    });
  }
  if (tooShort) {
    weaknesses.push({
      title: 'Answer is very brief',
      description: 'There is not enough here for an interviewer to judge your reasoning.',
    });
  }

  return {
    strengths,
    weaknesses,
    suggestedImprovements: [
      {
        title: 'Check your answer against the expected points',
        description: `A strong answer to this question covers: ${context.grading.rubric.join('; ')}.`,
        actionableStep:
          'Re-answer the question out loud, making sure you touch each of those points in order.',
      },
    ],
    scores,
    overallScore: computeOverallScore(scores),
    summary: context.objectiveResult
      ? `${correct ? 'Correct.' : 'Not correct.'} ${context.objectiveResult.explanation}`
      : 'Detailed AI feedback was not available for this answer, so this is a checklist-based response. Compare your answer against the expected points above.',
    insufficientAnswer: tooShort,
    evaluationLimitation:
      'Generated without AI analysis: the content of your answer was not assessed in detail.',
  };
}

export interface EvaluationOutcome {
  evaluation: AnswerEvaluation;
  source: ContentSourceName;
}

export async function evaluateAnswer(
  userId: string,
  context: EvaluationContext,
): Promise<EvaluationOutcome> {
  const schema = evaluationSchemaForMode(context.mode);

  const result = await runLlm(userId, {
    operation: 'evaluateInterviewAnswer',
    systemPrompt: systemPromptFor(context.mode),
    task: buildTask(context),
    untrustedInputs: [{ label: 'candidate_answer', value: context.answerText }],
    schema,
    // Mode-specific: the four modes have different score dimensions, so sharing
    // one name makes provider-side logs and schema names ambiguous.
    schemaName: `answer_evaluation_${context.mode.toLowerCase()}`,
    fallback: () => schema.parse(curatedEvaluation(context)),
  });

  const scores = result.data.scores as Record<string, number>;

  // Objective correctness is ours, not the model's, so it cannot be overridden.
  if (context.objectiveResult && 'correctness' in scores) {
    scores.correctness = context.objectiveResult.isCorrect ? 5 : 1;
  }

  const evaluation: AnswerEvaluation = {
    strengths: result.data.strengths,
    weaknesses: result.data.weaknesses,
    suggestedImprovements: result.data.suggestedImprovements,
    scores,
    // Recomputed in code so the headline always matches the dimensions shown.
    overallScore: computeOverallScore(scores),
    summary: result.data.summary,
    insufficientAnswer: result.data.insufficientAnswer,
    evaluationLimitation: result.data.evaluationLimitation,
    objectiveResult: context.objectiveResult,
    generatedBy: context.objectiveResult && result.source === 'CURATED_FALLBACK'
      ? 'DETERMINISTIC'
      : result.source === 'CURATED_FALLBACK'
        ? 'CURATED_FALLBACK'
        : 'AI_GENERATED',
  };

  return { evaluation, source: result.source };
}

/* ---------------------------------------------------------------------------
 * Final session summary
 * ------------------------------------------------------------------------- */

const SUMMARY_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are now writing the closing summary for a completed practice interview. Base it only on the per-answer evaluations supplied to you. Be specific about patterns across answers rather than repeating individual feedback, and keep the tone direct and useful.`;

export interface SummaryContext {
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  averageScore: number;
  answered: number;
  total: number;
  perAnswer: Array<{
    topic: string;
    overallScore: number;
    summary: string;
    weaknesses: string[];
    strengths: string[];
  }>;
}

function curatedSummary(context: SummaryContext): InterviewSummary {
  const sorted = [...context.perAnswer].sort((a, b) => b.overallScore - a.overallScore);
  const best = sorted.slice(0, 3);
  const worst = sorted.slice(-3).reverse();

  return {
    headline: `${context.answered} of ${context.total} answered, average score ${context.averageScore}/100`,
    overallAssessment:
      'This summary was generated without AI analysis. It ranks your answers by the scores recorded during the session, so use the per-answer feedback above for detail.',
    topStrengths:
      best.length > 0
        ? best.map((item) => `${item.topic}: scored ${item.overallScore}/100`)
        : ['Not enough answers to identify a pattern.'],
    focusAreas:
      worst.length > 0
        ? worst.map((item) => `${item.topic}: scored ${item.overallScore}/100`)
        : ['Answer more questions to get a focus area.'],
    recommendedNextSteps: [
      'Re-run this mode at the same difficulty and compare your scores.',
      'Work through the improvement step on your two lowest-scoring answers.',
      'Run a skill gap analysis for this role to see what to study next.',
    ],
  };
}

export async function generateSummary(
  userId: string,
  context: SummaryContext,
): Promise<{ summary: InterviewSummary; source: ContentSourceName }> {
  const task = [
    `Write the closing summary for a completed ${INTERVIEW_MODE_LABELS[context.mode]}.`,
    '',
    `Target role: ${context.targetRole}`,
    `Experience level: ${context.experienceLevel}`,
    `Questions answered: ${context.answered} of ${context.total}`,
    `Average score across answers: ${context.averageScore}/100`,
    '',
    'Per-answer results:',
    ...context.perAnswer.map(
      (item, index) =>
        `${index + 1}. [${item.topic}] ${item.overallScore}/100 - ${item.summary}` +
        (item.weaknesses.length > 0 ? ` Weaknesses noted: ${item.weaknesses.join('; ')}.` : '') +
        (item.strengths.length > 0 ? ` Strengths noted: ${item.strengths.join('; ')}.` : ''),
    ),
  ].join('\n');

  const result = await runLlm(userId, {
    operation: 'generateInterviewSummary',
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    // The per-answer summaries are themselves derived from candidate answers,
    // so they stay in the trusted task framing only because we generated them.
    task,
    untrustedInputs: [],
    schema: interviewSummarySchema,
    schemaName: 'interview_summary',
    fallback: () => curatedSummary(context),
  });

  return { summary: result.data, source: result.source };
}
