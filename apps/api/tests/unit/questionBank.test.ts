import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, INTERVIEW_MODES } from '@career-prep/shared';
import {
  curatedQuestionCount,
  curatedQuestions,
} from '../../src/services/interview/questionBank.js';
import { generatedQuestionSchema } from '../../src/services/interview/schemas.js';
import { MODE_CONFIG } from '../../src/services/interview/modes.js';

describe('curated question bank', () => {
  it.each(INTERVIEW_MODES)('holds at least 15 questions for %s', (mode) => {
    expect(curatedQuestionCount(mode)).toBeGreaterThanOrEqual(15);
  });

  it.each(INTERVIEW_MODES)('every %s question satisfies the generated-question schema', (mode) => {
    for (const difficulty of DIFFICULTIES) {
      for (const question of curatedQuestions(mode, difficulty, 15, 'seed')) {
        const result = generatedQuestionSchema.safeParse(question);
        if (!result.success) {
          throw new Error(
            `${mode}/${difficulty} "${question.questionText.slice(0, 40)}": ${result.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          );
        }
      }
    }
  });

  it('never repeats a question inside one session', () => {
    const questions = curatedQuestions('TECHNICAL', 'MEDIUM', 15, 'seed-a');
    const texts = new Set(questions.map((question) => question.questionText));
    expect(texts.size).toBe(questions.length);
  });

  it('returns the same set for the same seed and a different set for another', () => {
    const a = curatedQuestions('HR', 'MEDIUM', 5, 'seed-a').map((q) => q.questionText);
    const again = curatedQuestions('HR', 'MEDIUM', 5, 'seed-a').map((q) => q.questionText);
    const b = curatedQuestions('HR', 'MEDIUM', 5, 'seed-b').map((q) => q.questionText);

    expect(again).toEqual(a);
    expect(b).not.toEqual(a);
  });

  it('prefers the requested difficulty but still fills the count', () => {
    const questions = curatedQuestions('TECHNICAL', 'HARD', 10, 'seed');
    expect(questions).toHaveLength(10);
    expect(questions.every((question) => question.difficulty === 'HARD')).toBe(true);
  });

  it('gives aptitude questions a server-side answer key', () => {
    const questions = curatedQuestions('APTITUDE', 'MEDIUM', 10, 'seed');
    const multipleChoice = questions.filter((q) => q.answerFormat === 'MULTIPLE_CHOICE');

    expect(multipleChoice.length).toBeGreaterThan(0);
    for (const question of multipleChoice) {
      expect(question.options).toHaveLength(4);
      expect(question.correctOptionIndex).not.toBeNull();
      expect(question.expectedAnswer.length).toBeGreaterThan(5);
    }
  });

  it('keeps non-aptitude modes free-text only', () => {
    for (const mode of ['TECHNICAL', 'NON_TECHNICAL', 'HR'] as const) {
      const questions = curatedQuestions(mode, 'MEDIUM', 15, 'seed');
      expect(questions.every((question) => question.answerFormat === 'TEXT')).toBe(true);
      expect(questions.every((question) => question.options.length === 0)).toBe(true);
    }
  });
});

describe('mode configuration', () => {
  it.each(INTERVIEW_MODES)('%s has its own focus areas and criteria', (mode) => {
    const config = MODE_CONFIG[mode];
    expect(config.focusAreas.length).toBeGreaterThan(3);
    expect(config.evaluationCriteria).toHaveLength(4);
    expect(config.generationGuidance.length).toBeGreaterThan(50);
    expect(config.evaluationGuidance.length).toBeGreaterThan(50);
  });

  it('gives the four modes four distinct prompts', () => {
    const generation = new Set(INTERVIEW_MODES.map((mode) => MODE_CONFIG[mode].generationGuidance));
    const evaluation = new Set(INTERVIEW_MODES.map((mode) => MODE_CONFIG[mode].evaluationGuidance));
    expect(generation.size).toBe(4);
    expect(evaluation.size).toBe(4);
  });

  it('only allows multiple choice in the aptitude mode', () => {
    expect(MODE_CONFIG.APTITUDE.allowsMultipleChoice).toBe(true);
    expect(MODE_CONFIG.TECHNICAL.allowsMultipleChoice).toBe(false);
    expect(MODE_CONFIG.NON_TECHNICAL.allowsMultipleChoice).toBe(false);
    expect(MODE_CONFIG.HR.allowsMultipleChoice).toBe(false);
  });

  it('tells the non-technical mode not to test programming', () => {
    expect(MODE_CONFIG.NON_TECHNICAL.generationGuidance).toMatch(/do not ask about programming/i);
  });

  it('bars protected characteristics from HR questions and evaluation', () => {
    expect(MODE_CONFIG.HR.generationGuidance).toMatch(/never ask about age, gender/i);
    expect(MODE_CONFIG.HR.evaluationGuidance).toMatch(/protected personal characteristic/i);
  });
});
