import { describe, expect, it } from 'vitest';
import { emptyParsedResume, resumeFitReportSchema, type ParsedResume } from '@career-prep/shared';
import {
  computeResumeQuality,
  describeQuality,
} from '../../src/services/resumeQuality.service.js';
import {
  buildCuratedFitReport,
  type ResumeFitInputs,
} from '../../src/services/resumeFit.service.js';
import { SAMPLE_RESUME_TEXT } from '../helpers/fixtures.js';

function parsed(overrides: Partial<ParsedResume> = {}): ParsedResume {
  return {
    ...emptyParsedResume(),
    candidateName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+44 7700 900123',
    summary: 'Backend engineer with four years building Node.js and Python services for payments.',
    skills: ['TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'Vitest'],
    workExperience: [
      'Cut p95 latency on the orders API from 820ms to 180ms by removing N+1 queries.',
      'Built the billing reconciliation service in Python and PostgreSQL.',
    ],
    projects: ['Open-source rate limiter for Express, used by 40 downstream projects.'],
    ...overrides,
  };
}

describe('computeResumeQuality', () => {
  it('counts bullets that contain a measurable figure', () => {
    const checks = computeResumeQuality(parsed(), SAMPLE_RESUME_TEXT);

    expect(checks.bulletCount).toBe(3);
    // Two of the three contain a number.
    expect(checks.quantifiedBulletCount).toBe(2);
    expect(checks.quantifiedBulletRatio).toBeCloseTo(2 / 3, 5);
  });

  it('recognises bullets that open with an action verb', () => {
    const checks = computeResumeQuality(parsed(), SAMPLE_RESUME_TEXT);
    // "Cut" and "Built" are action verbs; the project line starts with "Open-source".
    expect(checks.actionVerbRatio).toBeCloseTo(2 / 3, 5);
  });

  it('reports a missing summary rather than guessing one', () => {
    const checks = computeResumeQuality(parsed({ summary: null }), SAMPLE_RESUME_TEXT);
    expect(checks.hasSummary).toBe(false);
  });

  it('treats a one-word summary as absent', () => {
    const checks = computeResumeQuality(parsed({ summary: 'Engineer.' }), SAMPLE_RESUME_TEXT);
    expect(checks.hasSummary).toBe(false);
  });

  it('names exactly which contact fields are missing', () => {
    const checks = computeResumeQuality(parsed({ phone: null, email: null }), SAMPLE_RESUME_TEXT);

    expect(checks.contactComplete).toBe(false);
    expect(checks.missingContactFields).toEqual(['email', 'phone']);
  });

  it('does not divide by zero when there are no bullets', () => {
    const checks = computeResumeQuality(
      parsed({ workExperience: [], projects: [], achievements: [] }),
      'short text',
    );

    expect(checks.bulletCount).toBe(0);
    expect(checks.quantifiedBulletRatio).toBe(0);
    expect(checks.actionVerbRatio).toBe(0);
    expect(checks.longestBulletWords).toBe(0);
  });

  it('ignores fragments too short to be a real bullet', () => {
    const checks = computeResumeQuality(parsed({ workExperience: ['Python', 'SQL'] }), 'x');
    // The two one-word entries are skipped; only the project bullet counts.
    expect(checks.bulletCount).toBe(1);
  });
});

describe('describeQuality', () => {
  it('states the measurements as plain facts for the prompt', () => {
    const text = describeQuality(computeResumeQuality(parsed({ summary: null }), SAMPLE_RESUME_TEXT));

    expect(text).toContain('Professional summary present: NO');
    expect(text).toMatch(/Bullets containing a number or percentage: \d+/);
  });
});

function fitInputs(overrides: Partial<ResumeFitInputs> = {}): ResumeFitInputs {
  const data = overrides.parsed ?? parsed();
  return {
    targetRole: 'Backend Engineer',
    jobDescription: '',
    resumeText: SAMPLE_RESUME_TEXT,
    parsed: data,
    checks: computeResumeQuality(data, SAMPLE_RESUME_TEXT),
    profileSkills: [],
    ...overrides,
  };
}

describe('buildCuratedFitReport', () => {
  it('satisfies the same schema the AI path is held to', () => {
    const report = buildCuratedFitReport(fitInputs());
    expect(resumeFitReportSchema.safeParse(report).success).toBe(true);
  });

  it('flags a missing summary as a high-severity gap with a concrete fix', () => {
    const report = buildCuratedFitReport(fitInputs({ parsed: parsed({ summary: null }) }));
    const gap = report.gaps.find((entry) => /summary/i.test(entry.title));

    expect(gap?.severity).toBe('HIGH');
    // The fix names the role, so it is actionable rather than generic advice.
    expect(gap?.fix).toContain('Backend Engineer');
  });

  it('flags thin quantification when few bullets carry numbers', () => {
    const thin = parsed({
      workExperience: ['Worked on the orders API', 'Helped with the billing service'],
      projects: [],
    });
    const report = buildCuratedFitReport(fitInputs({ parsed: thin }));

    expect(report.gaps.some((gap) => /measurable results/i.test(gap.title))).toBe(true);
  });

  it('says plainly that the content was not analysed', () => {
    const report = buildCuratedFitReport(fitInputs());

    expect(report.verdict).toMatch(/structural/i);
    expect(report.summary).toMatch(/AI analysis was unavailable/i);
  });

  it('never invents keywords it did not find', () => {
    const report = buildCuratedFitReport(fitInputs());
    // Without a model there is no basis for naming absent role terms.
    expect(report.missingKeywords).toEqual([]);
    for (const keyword of report.matchedKeywords) {
      expect(parsed().skills).toContain(keyword);
    }
  });

  it('scores a resume missing most sections below one that has them', () => {
    const complete = buildCuratedFitReport(fitInputs());
    const sparse = buildCuratedFitReport(
      fitInputs({
        parsed: parsed({ summary: null, projects: [], workExperience: [], skills: [] }),
      }),
    );

    expect(sparse.matchScore).toBeLessThan(complete.matchScore);
  });

  it('keeps the target role we supplied rather than inferring one', () => {
    const report = buildCuratedFitReport(fitInputs({ targetRole: 'Data Analyst' }));
    expect(report.targetRole).toBe('Data Analyst');
  });
});
