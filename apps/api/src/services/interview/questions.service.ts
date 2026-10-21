import {
  DIFFICULTY_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  INTERVIEW_MODE_LABELS,
  type Difficulty,
  type ExperienceLevel,
  type InterviewMode,
} from '@career-prep/shared';
import { clampForPrompt, runLlm, type ContentSourceName } from '../llm/index.js';
import { MODE_CONFIG } from './modes.js';
import { curatedQuestions } from './questionBank.js';
import { generatedQuestionsSchema, type GeneratedQuestion } from './schemas.js';

const MAX_RESUME_CHARS = 6_000;

export interface QuestionRequest {
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  difficulty: Difficulty;
  count: number;
  /** Used only to make questions relevant; no contact details are ever sent. */
  resumeHighlights: string;
  profileSkills: string[];
  /** Topics already used in this session, so follow-up questions do not repeat. */
  usedTopics: string[];
  seed: string;
}

function systemPrompt(mode: InterviewMode): string {
  const config = MODE_CONFIG[mode];
  return `You are an experienced interviewer writing practice questions for a ${INTERVIEW_MODE_LABELS[mode]}.

Focus areas for this mode: ${config.focusAreas.join(', ')}.

${config.generationGuidance}

General rules:
- Every question must be distinct in both topic and wording. No rephrasings of each other.
- Calibrate to the stated experience level: do not ask a fresher about running a platform team, and do not ask an experienced engineer to define a variable.
- expectedAnswer and rubric are used to grade the candidate and are never shown before they answer. Fill them properly.
- hint must help the candidate start without revealing the answer, or be null.
- Never reference the candidate's personal details, and never ask about protected personal characteristics.`;
}

function buildTask(request: QuestionRequest): string {
  const config = MODE_CONFIG[request.mode];
  const lines = [
    `Write ${request.count} ${DIFFICULTY_LABELS[request.difficulty].toLowerCase()} practice questions.`,
    '',
    `Interview mode: ${INTERVIEW_MODE_LABELS[request.mode]}`,
    `Target role: ${request.targetRole}`,
    `Experience level: ${EXPERIENCE_LEVEL_LABELS[request.experienceLevel]}`,
    `Difficulty: ${request.difficulty} (set every question difficulty to exactly this value)`,
    `Answer format: ${
      config.allowsMultipleChoice
        ? 'use MULTIPLE_CHOICE with four options where it suits the question, otherwise TEXT'
        : 'use TEXT for every question and leave options empty'
    }`,
  ];

  if (request.profileSkills.length > 0) {
    lines.push(
      `Skills the candidate has confirmed (use these to pick relevant topics): ${request.profileSkills
        .slice(0, 20)
        .join(', ')}`,
    );
  }
  if (request.usedTopics.length > 0) {
    lines.push(`Topics already asked in this session - avoid all of them: ${request.usedTopics.join(', ')}`);
  }

  return lines.join('\n');
}

export interface GeneratedQuestionSet {
  questions: GeneratedQuestion[];
  source: ContentSourceName;
}

/**
 * Generates questions for a session. Falls back to the curated bank whenever the
 * provider cannot produce valid output, and reports which of the two was used.
 */
export async function generateQuestions(
  userId: string,
  request: QuestionRequest,
): Promise<GeneratedQuestionSet> {
  const fallback = () => ({
    questions: curatedQuestions(request.mode, request.difficulty, request.count, request.seed),
  });

  const result = await runLlm(userId, {
    operation: 'generateInterviewQuestions',
    systemPrompt: systemPrompt(request.mode),
    task: buildTask(request),
    untrustedInputs: [
      {
        label: 'candidate_resume_highlights',
        value: clampForPrompt(request.resumeHighlights, MAX_RESUME_CHARS),
      },
    ],
    schema: generatedQuestionsSchema,
    schemaName: 'interview_questions',
    fallback,
  });

  const seen = new Set(request.usedTopics.map((topic) => topic.toLowerCase()));
  const unique = result.data.questions.filter((question) => {
    const key = question.topic.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Top up from the curated bank if de-duplication left us short.
  let usedCurated = false;
  if (unique.length < request.count) {
    const topUp = curatedQuestions(
      request.mode,
      request.difficulty,
      request.count,
      request.seed,
    ).filter((question) => !seen.has(question.topic.toLowerCase()));

    for (const question of topUp) {
      if (unique.length >= request.count) break;
      unique.push(question);
      seen.add(question.topic.toLowerCase());
      usedCurated = true;
    }
  }

  return {
    questions: unique.slice(0, request.count).map((question) => ({
      ...question,
      difficulty: request.difficulty,
    })),
    // A mixed set is reported as curated: part of it did not come from the model.
    source: usedCurated ? 'CURATED_FALLBACK' : result.source,
  };
}
