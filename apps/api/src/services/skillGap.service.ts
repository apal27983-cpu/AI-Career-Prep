import {
  EXPERIENCE_LEVEL_LABELS,
  PROFICIENCY_SCALE,
  skillGapReportSchema,
  type ExperienceLevel,
  type GapLevel,
  type SkillGapItem,
  type SkillGapReport,
} from '@career-prep/shared';
import { clampForPrompt, runLlm, type LlmResult } from './llm/index.js';
import { logger } from '../utils/logger.js';

const MAX_RESUME_CHARS = 14_000;
const MAX_JD_CHARS = 6_000;

const SYSTEM_PROMPT = `You are an experienced technical recruiter and career coach producing a skill gap analysis.

How to judge evidence - this matters more than anything else:
- "EVIDENCE_IN_RESUME": the resume shows the skill being used (a project, a responsibility, a measurable result).
- "CLAIMED_WITHOUT_EVIDENCE": the skill is listed but nothing demonstrates it.
- "NOT_MENTIONED": the resume does not mention it. This is NOT proof the candidate lacks the skill - say so in the explanation.
- "PROFICIENCY_UNCLEAR": the skill appears but there is not enough detail to judge depth.

Read negations carefully. A line such as "no Docker experience yet" or "currently learning Kubernetes" mentions the skill but states the candidate does NOT have it. That is never "EVIDENCE_IN_RESUME" - the skill belongs in missingSkills, and the explanation should quote what the resume actually said.

Rules:
- Never invent employers, projects, certifications, degrees or years of experience. If the data does not show it, it did not happen as far as you are concerned.
- Proficiency is a 1-5 estimate on this scale: 1 ${PROFICIENCY_SCALE.labels[1]}, 2 ${PROFICIENCY_SCALE.labels[2]}, 3 ${PROFICIENCY_SCALE.labels[3]}, 4 ${PROFICIENCY_SCALE.labels[4]}, 5 ${PROFICIENCY_SCALE.labels[5]}.
- Set currentProficiency to null when the data does not support any estimate. Do not guess a number to fill the field.
- requiredProficiency is what the target role and experience level genuinely need, not the maximum.
- readinessScore is 0-100 and is an estimate of preparedness for interviews for this role. It is not a hiring probability, and it must be consistent with the gaps you listed.
- "existingSkills" holds skills the candidate has some support for. "missingSkills" holds skills the role needs that the resume does not support.
- Put anything you could not establish into "limitations".
- Judge only skills and experience. Never comment on age, gender, nationality, ethnicity, religion, disability, marital or family status, or any other protected characteristic.`;

export interface SkillGapInputs {
  targetRole: string;
  jobDescription: string;
  experienceLevel: ExperienceLevel;
  yearsOfExperience: number | null;
  currentRole: string | null;
  /** Candidate-confirmed skills. These outrank anything parsed from the resume. */
  confirmedSkills: string[];
  resumeText: string;
  resumeSkills: string[];
  learningGoals: string[];
}

/** Gap level from the distance between current and required proficiency. */
function gapLevelFor(current: number | null, required: number): GapLevel {
  if (current === null) return required >= 4 ? 'HIGH' : 'MEDIUM';
  const delta = required - current;
  if (delta <= 0) return 'LOW';
  if (delta === 1) return 'MEDIUM';
  return 'HIGH';
}

/**
 * The headline score has to agree with the chart beneath it. The model's own
 * estimate is kept unless it contradicts the gaps it just listed, in which case
 * the deterministic figure wins and the disagreement is logged.
 */
export function reconcileReadiness(report: SkillGapReport): SkillGapReport {
  const all = [...report.existingSkills, ...report.missingSkills];
  if (all.length === 0) return report;

  const earned = all.reduce((total, item) => {
    const current = item.currentProficiency ?? 0;
    return total + Math.min(current / item.requiredProficiency, 1);
  }, 0);
  const derived = Math.round((earned / all.length) * 100);

  if (Math.abs(derived - report.readinessScore) <= 25) return report;

  logger.warn(
    { aiScore: report.readinessScore, derivedScore: derived },
    'Readiness score disagreed with the reported skill gaps; using the derived score',
  );
  return { ...report, readinessScore: derived };
}

function buildTask(inputs: SkillGapInputs): string {
  const lines = [
    'Produce a skill gap analysis for this candidate against the target role below.',
    '',
    `Target role: ${inputs.targetRole}`,
    `Experience level: ${EXPERIENCE_LEVEL_LABELS[inputs.experienceLevel]} (${inputs.experienceLevel})`,
  ];

  if (inputs.yearsOfExperience !== null) {
    lines.push(`Years of experience stated by the candidate: ${inputs.yearsOfExperience}`);
  }
  if (inputs.currentRole) {
    lines.push(`Current role or study status: ${inputs.currentRole}`);
  }
  lines.push(
    `Candidate-confirmed skills (treat as reliable): ${
      inputs.confirmedSkills.length > 0 ? inputs.confirmedSkills.join(', ') : 'none provided'
    }`,
  );
  if (inputs.learningGoals.length > 0) {
    lines.push(`Skills the candidate wants to learn: ${inputs.learningGoals.join(', ')}`);
  }
  lines.push(
    '',
    'Set "targetRole" to exactly the target role above and "experienceLevel" to exactly the enum value above.',
    'Cover 6-12 existing skills and 4-10 missing skills. Order both lists by importance to the role.',
  );

  return lines.join('\n');
}

/** Minimum content needed before an analysis is worth running. */
export function hasEnoughInputs(inputs: SkillGapInputs): boolean {
  return inputs.confirmedSkills.length >= 1 || inputs.resumeText.trim().length >= 200;
}

const FALLBACK_CATEGORIES: Array<{ category: string; keywords: string[] }> = [
  { category: 'Programming', keywords: ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift'] },
  { category: 'Frontend', keywords: ['react', 'vue', 'angular', 'html', 'css', 'tailwind', 'next.js', 'svelte'] },
  { category: 'Backend', keywords: ['node', 'express', 'django', 'flask', 'spring', 'rails', 'api', 'rest', 'graphql', '.net'] },
  { category: 'Data', keywords: ['sql', 'postgres', 'mysql', 'mongodb', 'redis', 'pandas', 'spark', 'etl', 'database'] },
  { category: 'Cloud & DevOps', keywords: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'jenkins', 'linux'] },
  { category: 'Testing', keywords: ['jest', 'vitest', 'pytest', 'selenium', 'cypress', 'playwright', 'junit', 'testing'] },
  { category: 'Collaboration', keywords: ['agile', 'scrum', 'jira', 'git', 'communication', 'stakeholder', 'leadership', 'mentoring'] },
];

function categoriseSkill(skill: string): string {
  const lower = skill.toLowerCase();
  const match = FALLBACK_CATEGORIES.find((entry) =>
    entry.keywords.some((keyword) => lower.includes(keyword)),
  );
  return match ? match.category : 'General';
}

/** Core skills the curated report expects for broad role families. */
const ROLE_BASELINES: Array<{ pattern: RegExp; skills: string[] }> = [
  {
    pattern: /(front[- ]?end|react|ui engineer|web developer)/i,
    skills: ['JavaScript', 'TypeScript', 'React', 'CSS', 'Accessibility', 'Testing', 'Git'],
  },
  {
    pattern: /(back[- ]?end|api|server|node|python|java developer)/i,
    skills: ['Data structures', 'REST API design', 'SQL', 'Testing', 'Caching', 'Git', 'System design basics'],
  },
  {
    pattern: /(full[- ]?stack|software engineer|sde|developer)/i,
    skills: ['Data structures', 'SQL', 'REST API design', 'Version control', 'Testing', 'Debugging', 'System design basics'],
  },
  {
    pattern: /(data (analyst|scientist|engineer)|analytics|machine learning|ml engineer)/i,
    skills: ['SQL', 'Python', 'Statistics', 'Data visualisation', 'Data modelling', 'Communication of findings'],
  },
  {
    pattern: /(devops|sre|platform|cloud|infrastructure)/i,
    skills: ['Linux', 'CI/CD', 'Containers', 'Infrastructure as code', 'Monitoring', 'Networking basics'],
  },
  {
    pattern: /(product|business analyst|project manager|program manager)/i,
    skills: ['Stakeholder communication', 'Requirement gathering', 'Prioritisation', 'Data-informed decisions', 'Roadmapping'],
  },
];

function baselineSkillsFor(role: string): string[] {
  const match = ROLE_BASELINES.find((entry) => entry.pattern.test(role));
  return (
    match?.skills ?? [
      'Core domain knowledge',
      'Written and verbal communication',
      'Problem solving',
      'Collaboration',
      'Tools used day to day in the role',
    ]
  );
}

function requiredFor(level: ExperienceLevel): number {
  switch (level) {
    case 'STUDENT_FRESHER':
      return 2;
    case 'ENTRY_LEVEL':
      return 3;
    case 'CAREER_SWITCHER':
      return 3;
    case 'INTERMEDIATE':
      return 4;
    case 'EXPERIENCED':
      return 4;
  }
}

/**
 * Deterministic report used when no provider is configured or the provider is
 * down. It makes no claims the inputs do not support: proficiency is left null
 * wherever the data cannot establish it.
 */
export function buildCuratedSkillGapReport(inputs: SkillGapInputs): SkillGapReport {
  const required = requiredFor(inputs.experienceLevel);
  const resumeLower = inputs.resumeText.toLowerCase();
  const confirmed = new Set(inputs.confirmedSkills.map((skill) => skill.toLowerCase()));

  const existingSkills: SkillGapItem[] = inputs.confirmedSkills.slice(0, 12).map((skill) => {
    const inResume = resumeLower.includes(skill.toLowerCase());
    const current = inResume ? Math.max(required - 1, 1) : null;
    return {
      skill,
      category: categoriseSkill(skill),
      evidenceStatus: inResume ? 'EVIDENCE_IN_RESUME' : 'CLAIMED_WITHOUT_EVIDENCE',
      evidence: inResume
        ? 'This skill appears in the uploaded resume text.'
        : null,
      currentProficiency: current,
      requiredProficiency: required,
      gapLevel: gapLevelFor(current, required),
      explanation: inResume
        ? 'You listed this skill and the resume mentions it. Depth was not assessed without AI analysis.'
        : 'You listed this skill, but the resume does not show where you used it. Add a project or result that demonstrates it.',
      recommendedAction: `Prepare one concrete example of using ${skill} and the outcome it produced.`,
    };
  });

  const missingSkills: SkillGapItem[] = baselineSkillsFor(inputs.targetRole)
    .filter((skill) => !confirmed.has(skill.toLowerCase()))
    .slice(0, 8)
    .map((skill) => {
      const inResume = resumeLower.includes(skill.toLowerCase());
      return {
        skill,
        category: categoriseSkill(skill),
        evidenceStatus: inResume ? 'PROFICIENCY_UNCLEAR' : 'NOT_MENTIONED',
        evidence: inResume ? 'Mentioned in the resume, but not confirmed in your profile.' : null,
        currentProficiency: null,
        requiredProficiency: required,
        gapLevel: inResume ? 'MEDIUM' : 'HIGH',
        explanation: inResume
          ? 'This appears in your resume but you did not confirm it, so the level could not be established.'
          : 'This is commonly expected for the target role and was not found in your profile or resume. Not finding it here does not mean you lack it - add it to your profile if you have it.',
        recommendedAction: `Add ${skill} to your profile if you already have it, or build one small project that uses it.`,
      };
    });

  const base: SkillGapReport = {
    targetRole: inputs.targetRole,
    experienceLevel: inputs.experienceLevel,
    readinessScore: 0,
    readinessRationale:
      'This is a baseline report generated without AI analysis: it compares the skills you confirmed against a standard checklist for the target role. Connect an AI provider for a report based on your actual resume content.',
    existingSkills,
    missingSkills,
    learningPriorities: missingSkills.slice(0, 5).map((item) => item.skill),
    suggestedProjects: missingSkills.slice(0, 3).map((item) => ({
      title: `Small project using ${item.skill}`,
      description: `Build something end to end that forces you to use ${item.skill}, then write two sentences about what you learned so you can use it as an interview example.`,
      skillsPractised: [item.skill],
    })),
    suggestedInterviewTopics: [...existingSkills.slice(0, 4), ...missingSkills.slice(0, 4)].map(
      (item) => item.skill,
    ),
    learningRoadmap: missingSkills.slice(0, 4).map((item, index) => ({
      title: `Step ${index + 1}: ${item.skill}`,
      description: item.recommendedAction,
      skills: [item.skill],
      estimatedEffort: '1-2 weeks',
    })),
    nextSteps: [
      'Confirm your skills on the profile page so the analysis has reliable input.',
      'Upload or re-check your resume so each listed skill has a project or result behind it.',
      'Run a practice interview in your weakest area.',
    ],
    limitations: [
      'Generated without AI analysis, so it does not read your resume in detail.',
      'Proficiency levels were not estimated for skills with no supporting evidence.',
    ],
  };

  return reconcileReadiness(base);
}

export async function analyseSkillGaps(
  userId: string,
  inputs: SkillGapInputs,
): Promise<LlmResult<SkillGapReport>> {
  const result = await runLlm(userId, {
    operation: 'analyzeSkillGaps',
    systemPrompt: SYSTEM_PROMPT,
    task: buildTask(inputs),
    untrustedInputs: [
      { label: 'resume_text', value: clampForPrompt(inputs.resumeText, MAX_RESUME_CHARS) },
      { label: 'target_job_description', value: clampForPrompt(inputs.jobDescription, MAX_JD_CHARS) },
    ],
    schema: skillGapReportSchema,
    schemaName: 'skill_gap_report',
    fallback: () => buildCuratedSkillGapReport(inputs),
  });

  return {
    ...result,
    data: reconcileReadiness({
      ...result.data,
      // The role and level are ours, not the model's, so they cannot drift.
      targetRole: inputs.targetRole,
      experienceLevel: inputs.experienceLevel,
    }),
  };
}
