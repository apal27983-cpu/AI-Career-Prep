import {
  RESUME_SECTIONS,
  resumeFitReportSchema,
  type ParsedResume,
  type ResumeFitReport,
  type ResumeQualityChecks,
} from '@career-prep/shared';
import { clampForPrompt, runLlm, type LlmResult } from './llm/index.js';
import { describeQuality } from './resumeQuality.service.js';

const MAX_RESUME_CHARS = 14_000;
const MAX_JD_CHARS = 6_000;

const SYSTEM_PROMPT = `You are an experienced recruiter reviewing a candidate's RESUME against a target role. You are judging the document, not the person: how well does this resume present this candidate for this job, and what should they change in it?

What to judge:
- Does the resume show evidence that the role's core requirements are met?
- Are achievements measurable, or just duties restated?
- Are the right sections present, in the right depth?
- Would a recruiter skimming for 20 seconds see the relevant things first?

Rules:
- Quote or closely paraphrase the resume when you claim something is a strength. If nothing in the document backs it, set evidence to null and do not claim it.
- Never invent experience, employers, dates, certifications or numbers the resume does not contain.
- A fix must be the actual edit to make. "Add metrics" is not a fix; "Change 'improved API performance' to state the before and after latency" is.
- The objective measurements supplied to you were computed from the document by code. Treat them as established fact and never contradict them.
- matchScore is 0-100 and estimates how well this RESUME presents this candidate for this role. It is not a hiring probability. Be honest: a resume missing most of the role's requirements should score low.
- missingKeywords must be terms the role genuinely needs that do not appear in the resume. Do not pad the list.
- sectionFeedback should cover these sections: ${RESUME_SECTIONS.join(', ')}. Mark a section MISSING only when it is genuinely absent.
- Judge only skills, experience and how they are presented. Never comment on age, gender, nationality, ethnicity, religion, disability, marital or family status, photographs or any other protected characteristic.`;

export interface ResumeFitInputs {
  targetRole: string;
  jobDescription: string;
  resumeText: string;
  parsed: ParsedResume;
  checks: ResumeQualityChecks;
  /** Candidate-confirmed skills from the profile, if any. */
  profileSkills: string[];
}

function buildTask(inputs: ResumeFitInputs): string {
  const lines = [
    `Review this resume against the target role and report how well it fits.`,
    '',
    `Target role: ${inputs.targetRole}`,
    '',
    'Objective measurements taken from the document by code (these are facts):',
    describeQuality(inputs.checks),
    '',
    `Skills parsed from the resume: ${
      inputs.parsed.skills.length > 0 ? inputs.parsed.skills.join(', ') : 'none found'
    }`,
  ];

  if (inputs.profileSkills.length > 0) {
    lines.push(`Skills the candidate confirmed on their profile: ${inputs.profileSkills.join(', ')}`);
  }

  lines.push(
    '',
    'Set "targetRole" to exactly the target role above.',
    'Give 3-6 strengths and 3-8 gaps, ordered by how much they affect the candidate chances.',
    'Give 3-5 prioritised fixes: the edits worth making first.',
  );

  return lines.join('\n');
}

/**
 * Baseline report used when no provider is configured or the provider is down.
 * It reports only what the deterministic checks already established, and says
 * plainly that the resume content itself was not read.
 */
export function buildCuratedFitReport(inputs: ResumeFitInputs): ResumeFitReport {
  const { checks } = inputs;
  const gaps: ResumeFitReport['gaps'] = [];

  if (!checks.hasSummary) {
    gaps.push({
      title: 'No professional summary',
      detail:
        'The resume opens without a short summary, so a recruiter has to infer your focus from the job history.',
      severity: 'HIGH',
      fix: `Add two or three lines at the top naming your target role (${inputs.targetRole}), your strongest two skills and one measurable result.`,
    });
  }
  if (checks.bulletCount > 0 && checks.quantifiedBulletRatio < 0.3) {
    gaps.push({
      title: 'Very few measurable results',
      detail: `Only ${checks.quantifiedBulletCount} of ${checks.bulletCount} bullets contain a number, so the impact of your work is hard to judge.`,
      severity: 'HIGH',
      fix: 'Rewrite your three strongest bullets to include a before and after figure, a volume, or a time saved.',
    });
  }
  if (!checks.contactComplete) {
    gaps.push({
      title: 'Incomplete contact details',
      detail: `These could not be found in the document: ${checks.missingContactFields.join(', ')}.`,
      severity: 'MEDIUM',
      fix: 'Put your name, email and phone number on the first line of the resume as plain text.',
    });
  }
  if (!checks.hasAchievements) {
    gaps.push({
      title: 'No achievements section',
      detail: 'Awards, rankings and notable results are not called out separately.',
      severity: 'LOW',
      fix: 'Add a short achievements section if you have anything measurable to put in it. Skip it if you do not.',
    });
  }
  if (checks.longestBulletWords > 60) {
    gaps.push({
      title: 'Some bullets are too long to skim',
      detail: `The longest runs to ${checks.longestBulletWords} words.`,
      severity: 'MEDIUM',
      fix: 'Split any bullet over about 30 words into two, each with one idea.',
    });
  }

  const strengths: ResumeFitReport['strengths'] = [];
  if (checks.skillCount >= 8) {
    strengths.push({
      title: 'Broad skills list',
      detail: `${checks.skillCount} skills were parsed from the document.`,
      evidence: null,
    });
  }
  if (checks.hasProjects) {
    strengths.push({
      title: 'Projects are included',
      detail: 'Project work gives a recruiter something concrete to ask about.',
      evidence: null,
    });
  }
  if (checks.actionVerbRatio >= 0.5) {
    strengths.push({
      title: 'Bullets lead with action verbs',
      detail: `${Math.round(checks.actionVerbRatio * 100)}% of bullets start with a verb such as "Built" or "Led".`,
      evidence: null,
    });
  }

  const sectionFeedback: ResumeFitReport['sectionFeedback'] = [
    {
      section: 'Contact details',
      status: checks.contactComplete ? 'GOOD' : 'NEEDS_WORK',
      comment: checks.contactComplete
        ? 'Name, email and phone were all found.'
        : `Could not find: ${checks.missingContactFields.join(', ')}.`,
    },
    {
      section: 'Professional summary',
      status: checks.hasSummary ? 'GOOD' : 'MISSING',
      comment: checks.hasSummary ? 'A summary is present.' : 'No summary section was found.',
    },
    {
      section: 'Skills',
      status: checks.skillCount > 0 ? 'GOOD' : 'MISSING',
      comment: `${checks.skillCount} skills parsed.`,
    },
    {
      section: 'Work experience',
      status: checks.hasWorkExperience ? 'GOOD' : 'MISSING',
      comment: checks.hasWorkExperience ? 'Experience entries found.' : 'No experience section found.',
    },
    {
      section: 'Projects',
      status: checks.hasProjects ? 'GOOD' : 'MISSING',
      comment: checks.hasProjects ? 'Projects found.' : 'No projects section found.',
    },
    {
      section: 'Achievements',
      status: checks.hasAchievements ? 'GOOD' : 'MISSING',
      comment: checks.hasAchievements ? 'Achievements found.' : 'No achievements section found.',
    },
  ];

  // Derived from the objective checks only, so it cannot claim more than it knows.
  const passed = sectionFeedback.filter((entry) => entry.status === 'GOOD').length;
  const matchScore = Math.round((passed / sectionFeedback.length) * 60 + checks.quantifiedBulletRatio * 20);

  return {
    targetRole: inputs.targetRole,
    matchScore,
    verdict: 'Structural review only - the resume content was not analysed.',
    summary:
      'AI analysis was unavailable, so this report covers only what can be measured directly from the document: which sections exist, how complete the contact details are, and how many bullets contain measurable results. Connect an AI provider for a review of the content against the target role.',
    strengths,
    gaps,
    matchedKeywords: inputs.parsed.skills.slice(0, 20),
    missingKeywords: [],
    sectionFeedback,
    prioritisedFixes: gaps.slice(0, 3).map((gap) => ({
      title: gap.title,
      why: gap.detail,
      how: gap.fix,
    })),
  };
}

export async function analyseResumeFit(
  userId: string,
  inputs: ResumeFitInputs,
): Promise<LlmResult<ResumeFitReport>> {
  const result = await runLlm(userId, {
    operation: 'analyzeResumeFit',
    systemPrompt: SYSTEM_PROMPT,
    task: buildTask(inputs),
    untrustedInputs: [
      { label: 'resume_text', value: clampForPrompt(inputs.resumeText, MAX_RESUME_CHARS) },
      {
        label: 'target_job_description',
        value: clampForPrompt(inputs.jobDescription, MAX_JD_CHARS),
      },
    ],
    schema: resumeFitReportSchema,
    schemaName: 'resume_fit_report',
    fallback: () => buildCuratedFitReport(inputs),
  });

  return {
    ...result,
    // The role is ours, not the model's, so it cannot drift.
    data: { ...result.data, targetRole: inputs.targetRole },
  };
}
