import { describe, expect, it } from 'vitest';
import { skillGapReportSchema } from '@career-prep/shared';
import {
  buildCuratedSkillGapReport,
  hasEnoughInputs,
  reconcileReadiness,
  type SkillGapInputs,
} from '../../src/services/skillGap.service.js';
import { SAMPLE_RESUME_TEXT } from '../helpers/fixtures.js';

function inputs(overrides: Partial<SkillGapInputs> = {}): SkillGapInputs {
  return {
    targetRole: 'Backend Engineer',
    jobDescription: '',
    experienceLevel: 'INTERMEDIATE',
    yearsOfExperience: 4,
    currentRole: 'Backend Engineer',
    confirmedSkills: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
    resumeText: SAMPLE_RESUME_TEXT,
    resumeSkills: ['TypeScript', 'PostgreSQL'],
    learningGoals: ['System design'],
    ...overrides,
  };
}

describe('hasEnoughInputs', () => {
  it('accepts a candidate with confirmed skills', () => {
    expect(hasEnoughInputs(inputs({ resumeText: '' }))).toBe(true);
  });

  it('accepts a candidate with only a resume', () => {
    expect(hasEnoughInputs(inputs({ confirmedSkills: [] }))).toBe(true);
  });

  it('rejects a candidate with neither', () => {
    expect(hasEnoughInputs(inputs({ confirmedSkills: [], resumeText: '' }))).toBe(false);
  });
});

describe('buildCuratedSkillGapReport', () => {
  const report = buildCuratedSkillGapReport(inputs());

  it('produces a report that satisfies the schema the AI path is held to', () => {
    expect(skillGapReportSchema.safeParse(report).success).toBe(true);
  });

  it('distinguishes a skill with resume evidence from one that is only claimed', () => {
    const withEvidence = report.existingSkills.find((item) => item.skill === 'TypeScript');
    const claimedOnly = report.existingSkills.find((item) => item.skill === 'Kubernetes');

    expect(withEvidence?.evidenceStatus).toBe('EVIDENCE_IN_RESUME');
    expect(claimedOnly?.evidenceStatus).toBe('CLAIMED_WITHOUT_EVIDENCE');
  });

  it('leaves proficiency unset when nothing supports an estimate', () => {
    const claimedOnly = report.existingSkills.find((item) => item.skill === 'Kubernetes');
    expect(claimedOnly?.currentProficiency).toBeNull();
  });

  it('says plainly that a missing skill is not proof the candidate lacks it', () => {
    const missing = report.missingSkills.find((item) => item.evidenceStatus === 'NOT_MENTIONED');
    expect(missing?.explanation).toMatch(/does not mean you lack it/i);
  });

  it('records that it was produced without AI analysis', () => {
    expect(report.readinessRationale).toMatch(/without AI analysis/i);
    expect(report.limitations.join(' ')).toMatch(/without AI analysis/i);
  });

  it('does not list a confirmed skill as missing', () => {
    const confirmed = new Set(inputs().confirmedSkills.map((skill) => skill.toLowerCase()));
    for (const item of report.missingSkills) {
      expect(confirmed.has(item.skill.toLowerCase())).toBe(false);
    }
  });

  it('scales the required proficiency to the experience level', () => {
    const fresher = buildCuratedSkillGapReport(inputs({ experienceLevel: 'STUDENT_FRESHER' }));
    const senior = buildCuratedSkillGapReport(inputs({ experienceLevel: 'EXPERIENCED' }));
    const fresherRequirement = fresher.missingSkills[0]?.requiredProficiency ?? 0;
    const seniorRequirement = senior.missingSkills[0]?.requiredProficiency ?? 0;
    expect(seniorRequirement).toBeGreaterThan(fresherRequirement);
  });
});

describe('reconcileReadiness', () => {
  const base = buildCuratedSkillGapReport(inputs());

  it('keeps a score that is consistent with the listed gaps', () => {
    const derived = reconcileReadiness(base).readinessScore;
    const kept = reconcileReadiness({ ...base, readinessScore: derived + 10 });
    expect(kept.readinessScore).toBe(derived + 10);
  });

  it('overrides a score that contradicts the gaps', () => {
    // Every skill is a high gap with no proficiency, so 98/100 is not credible.
    const inflated = reconcileReadiness({ ...base, readinessScore: 98 });
    expect(inflated.readinessScore).toBeLessThan(98);
  });

  it('leaves an empty report alone', () => {
    const empty = { ...base, existingSkills: [], missingSkills: [], readinessScore: 42 };
    expect(reconcileReadiness(empty).readinessScore).toBe(42);
  });
});
