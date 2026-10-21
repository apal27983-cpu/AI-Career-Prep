import { z } from 'zod';
import { LIMITS } from '../constants.js';

/**
 * "How good is this resume for this job?" - distinct from the skill gap report,
 * which asks "what skills is this candidate missing?". This one judges the
 * document: what it shows well, what it fails to show, and what to change.
 */

export const FIT_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type FitSeverity = (typeof FIT_SEVERITIES)[number];

export const SECTION_STATUSES = ['GOOD', 'NEEDS_WORK', 'MISSING'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const RESUME_SECTIONS = [
  'Contact details',
  'Professional summary',
  'Skills',
  'Work experience',
  'Projects',
  'Education',
  'Certifications',
  'Achievements',
] as const;

export const fitStrengthSchema = z.object({
  title: z.string().trim().min(1).max(140),
  detail: z.string().trim().min(1).max(700),
  /** Quote or close paraphrase from the resume. Null when nothing backs it. */
  evidence: z.string().trim().max(400).nullable(),
});

export const fitGapSchema = z.object({
  title: z.string().trim().min(1).max(140),
  detail: z.string().trim().min(1).max(700),
  severity: z.enum(FIT_SEVERITIES),
  /** The concrete edit to make. Not "improve this" - what to actually write. */
  fix: z.string().trim().min(1).max(700),
});

export const sectionFeedbackSchema = z.object({
  section: z.string().trim().min(1).max(60),
  status: z.enum(SECTION_STATUSES),
  comment: z.string().trim().min(1).max(500),
});

export const prioritisedFixSchema = z.object({
  title: z.string().trim().min(1).max(140),
  why: z.string().trim().min(1).max(500),
  how: z.string().trim().min(1).max(700),
});

export const resumeFitReportSchema = z.object({
  targetRole: z.string().trim().min(1).max(LIMITS.targetRoleMax),
  /** 0-100 AI estimate of how well the resume presents this candidate for the role. */
  matchScore: z.number().int().min(0).max(100),
  /** One line the candidate reads first. */
  verdict: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1500),
  strengths: z.array(fitStrengthSchema).max(8),
  gaps: z.array(fitGapSchema).max(10),
  /** Role-relevant terms the resume does show. */
  matchedKeywords: z.array(z.string().trim().min(1).max(60)).max(30),
  /** Role-relevant terms absent from the resume. */
  missingKeywords: z.array(z.string().trim().min(1).max(60)).max(30),
  sectionFeedback: z.array(sectionFeedbackSchema).max(12),
  prioritisedFixes: z.array(prioritisedFixSchema).max(6),
});

export type ResumeFitReport = z.infer<typeof resumeFitReportSchema>;
export type FitStrength = z.infer<typeof fitStrengthSchema>;
export type FitGap = z.infer<typeof fitGapSchema>;
export type SectionFeedback = z.infer<typeof sectionFeedbackSchema>;
export type PrioritisedFix = z.infer<typeof prioritisedFixSchema>;

export const analyzeResumeFitSchema = z.object({
  targetRole: z
    .string()
    .trim()
    .min(2, 'Enter the role you are targeting')
    .max(LIMITS.targetRoleMax, 'This is too long'),
  jobDescription: z
    .string()
    .trim()
    .max(LIMITS.jobDescriptionMax, 'Job description is too long')
    .optional()
    .default(''),
});

export type AnalyzeResumeFitInput = z.infer<typeof analyzeResumeFitSchema>;

/**
 * Objective checks computed in backend code, not by a model. They are facts
 * about the document, so they are shown as-is and are not labelled estimates.
 */
export interface ResumeQualityChecks {
  wordCount: number;
  hasSummary: boolean;
  hasAchievements: boolean;
  hasCertifications: boolean;
  hasProjects: boolean;
  hasWorkExperience: boolean;
  skillCount: number;
  contactComplete: boolean;
  missingContactFields: string[];
  bulletCount: number;
  /** Share of bullets containing a number, which is the usual proxy for impact. */
  quantifiedBulletRatio: number;
  quantifiedBulletCount: number;
  /** Bullets that open with a verb such as "Built", "Led", "Reduced". */
  actionVerbRatio: number;
  longestBulletWords: number;
}

export interface ResumeFitRecord {
  id: string;
  resumeId: string;
  targetRole: string;
  jobDescription: string | null;
  matchScore: number;
  report: ResumeFitReport;
  checks: ResumeQualityChecks;
  generatedBy: 'AI_GENERATED' | 'CURATED_FALLBACK';
  createdAt: string;
}
