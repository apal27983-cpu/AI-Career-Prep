import { describe, expect, it } from 'vitest';
import {
  evaluationSchemaForMode,
  INTERVIEW_MODES,
  MODE_SCORE_DIMENSIONS,
} from '@career-prep/shared';
import {
  computeOverallScore,
  gradeObjectiveAnswer,
} from '../../src/services/interview/evaluation.service.js';
import type { GradingMetadata } from '../../src/services/interview/schemas.js';

const grading = (correctOptionIndex: number | null): GradingMetadata => ({
  expectedAnswer: 'Speed is 80 km/h, so 400 / 80 = 5 hours.',
  rubric: ['Finds the speed first', 'Arrives at 5 hours'],
  correctOptionIndex,
  evaluationCriteria: ['Correctness'],
});

describe('computeOverallScore', () => {
  it('maps the bottom of the 1-5 scale to 0 and the top to 100', () => {
    expect(computeOverallScore({ a: 1, b: 1, c: 1, d: 1 })).toBe(0);
    expect(computeOverallScore({ a: 5, b: 5, c: 5, d: 5 })).toBe(100);
  });

  it('maps the midpoint to 50', () => {
    expect(computeOverallScore({ a: 3, b: 3, c: 3, d: 3 })).toBe(50);
  });

  it('averages mixed dimensions', () => {
    // mean 3.5 -> (3.5 - 1) / 4 = 0.625
    expect(computeOverallScore({ a: 2, b: 3, c: 4, d: 5 })).toBe(63);
  });

  it('returns 0 rather than NaN when there are no dimensions', () => {
    expect(computeOverallScore({})).toBe(0);
  });
});

describe('gradeObjectiveAnswer', () => {
  const options = ['4 hours', '5 hours', '5 hours 30 minutes', '6 hours'];

  it('marks the correct option correct', () => {
    const result = gradeObjectiveAnswer(grading(1), options, 1);
    expect(result?.isCorrect).toBe(true);
    expect(result?.expectedAnswer).toBe('Option 2: 5 hours');
  });

  it('marks a wrong option incorrect and reveals the expected answer', () => {
    const result = gradeObjectiveAnswer(grading(1), options, 3);
    expect(result?.isCorrect).toBe(false);
    expect(result?.explanation).toContain('400 / 80');
  });

  it('returns null for a free-text question', () => {
    expect(gradeObjectiveAnswer(grading(null), [], null)).toBeNull();
  });

  it('returns null when no option was selected', () => {
    expect(gradeObjectiveAnswer(grading(1), options, null)).toBeNull();
  });
});

describe('evaluationSchemaForMode', () => {
  it.each(INTERVIEW_MODES)('requires exactly the %s dimensions', (mode) => {
    const schema = evaluationSchemaForMode(mode);
    const dimensions = MODE_SCORE_DIMENSIONS[mode];
    const scores = Object.fromEntries(dimensions.map((key) => [key, 4]));

    const valid = schema.safeParse({
      strengths: [{ title: 'Clear', description: 'Explains the concept accurately.' }],
      weaknesses: [],
      suggestedImprovements: [
        { title: 'Add an example', description: 'Give a concrete case.', actionableStep: 'Pick one project.' },
      ],
      scores,
      overallScore: 75,
      summary: 'A reasonable answer.',
    });
    expect(valid.success).toBe(true);
  });

  it('returns one stable object per mode, so derived caches cannot cross modes', () => {
    // A provider caches the generated JSON Schema against this object. When the
    // builder returned a fresh object each call, a name-keyed cache served the
    // aptitude dimensions to a technical evaluation.
    expect(evaluationSchemaForMode('TECHNICAL')).toBe(evaluationSchemaForMode('TECHNICAL'));
    expect(evaluationSchemaForMode('TECHNICAL')).not.toBe(evaluationSchemaForMode('APTITUDE'));
  });

  it('gives each mode a distinct set of dimensions', () => {
    const keysPerMode = INTERVIEW_MODES.map((mode) =>
      [...MODE_SCORE_DIMENSIONS[mode]].sort().join(','),
    );
    expect(new Set(keysPerMode).size).toBe(INTERVIEW_MODES.length);
  });

  it('rejects an evaluation with a dimension from another mode', () => {
    const schema = evaluationSchemaForMode('HR');
    const result = schema.safeParse({
      strengths: [],
      weaknesses: [],
      suggestedImprovements: [
        { title: 'Add an example', description: 'Give a case.', actionableStep: 'Prepare one.' },
      ],
      // Technical dimensions do not belong to the HR rubric.
      scores: { technicalAccuracy: 4, reasoning: 4, completeness: 4, practicalApplicability: 4 },
      overallScore: 70,
      summary: 'Fine.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an evaluation with no suggested improvement', () => {
    const schema = evaluationSchemaForMode('TECHNICAL');
    const result = schema.safeParse({
      strengths: [],
      weaknesses: [],
      suggestedImprovements: [],
      scores: { technicalAccuracy: 4, reasoning: 4, completeness: 4, practicalApplicability: 4 },
      overallScore: 70,
      summary: 'Fine.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a score outside the 1-5 range', () => {
    const schema = evaluationSchemaForMode('TECHNICAL');
    const result = schema.safeParse({
      strengths: [],
      weaknesses: [],
      suggestedImprovements: [
        { title: 'Do X', description: 'Because Y.', actionableStep: 'Try Z.' },
      ],
      scores: { technicalAccuracy: 9, reasoning: 4, completeness: 4, practicalApplicability: 4 },
      overallScore: 70,
      summary: 'Fine.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an overall score outside 0-100', () => {
    const schema = evaluationSchemaForMode('TECHNICAL');
    const result = schema.safeParse({
      strengths: [],
      weaknesses: [],
      suggestedImprovements: [
        { title: 'Do X', description: 'Because Y.', actionableStep: 'Try Z.' },
      ],
      scores: { technicalAccuracy: 4, reasoning: 4, completeness: 4, practicalApplicability: 4 },
      overallScore: 420,
      summary: 'Fine.',
    });
    expect(result.success).toBe(false);
  });
});
