import { z } from 'zod';
import {
  EXPERIENCE_LEVELS,
  GAP_LEVELS,
  LIMITS,
  PROFICIENCY_SCALE,
  SKILL_EVIDENCE_STATUSES,
} from '../constants.js';

const proficiency = z
  .number()
  .int()
  .min(PROFICIENCY_SCALE.min)
  .max(PROFICIENCY_SCALE.max);

export const skillGapItemSchema = z.object({
  skill: z.string().trim().min(1).max(LIMITS.skillMax),
  category: z.string().trim().min(1).max(60),
  evidenceStatus: z.enum(SKILL_EVIDENCE_STATUSES),
  /** Quote or paraphrase from the resume. Null when nothing supported the skill. */
  evidence: z.string().trim().max(600).nullable(),
  currentProficiency: proficiency.nullable(),
  requiredProficiency: proficiency,
  gapLevel: z.enum(GAP_LEVELS),
  explanation: z.string().trim().min(1).max(900),
  recommendedAction: z.string().trim().min(1).max(600),
});

export type SkillGapItem = z.infer<typeof skillGapItemSchema>;

export const learningStepSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(900),
  skills: z.array(z.string().trim().max(LIMITS.skillMax)).max(12),
  estimatedEffort: z.string().trim().max(120),
});

export const suggestedProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(900),
  skillsPractised: z.array(z.string().trim().max(LIMITS.skillMax)).max(12),
});

/** The structure the model must return, validated before anything is persisted. */
export const skillGapReportSchema = z.object({
  targetRole: z.string().trim().min(1).max(LIMITS.targetRoleMax),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  /** 0-100, explicitly an AI estimate and never framed as a hiring probability. */
  readinessScore: z.number().int().min(0).max(100),
  readinessRationale: z.string().trim().min(1).max(1200),
  existingSkills: z.array(skillGapItemSchema).max(40),
  missingSkills: z.array(skillGapItemSchema).max(40),
  learningPriorities: z.array(z.string().trim().min(1).max(200)).max(12),
  suggestedProjects: z.array(suggestedProjectSchema).max(8),
  suggestedInterviewTopics: z.array(z.string().trim().min(1).max(200)).max(15),
  learningRoadmap: z.array(learningStepSchema).max(10),
  nextSteps: z.array(z.string().trim().min(1).max(300)).max(10),
  /** Set when the resume/profile did not contain enough to judge something. */
  limitations: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
});

export type SkillGapReport = z.infer<typeof skillGapReportSchema>;

export const analyzeSkillGapSchema = z.object({
  resumeId: z.string().uuid('Select a parsed resume').optional().nullable(),
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
  /** Candidate-corrected skills; these take precedence over the parsed list. */
  skills: z
    .array(z.string().trim().min(1).max(LIMITS.skillMax))
    .max(LIMITS.maxSkills)
    .optional()
    .default([]),
});

export type AnalyzeSkillGapInput = z.infer<typeof analyzeSkillGapSchema>;

export interface SkillGapAnalysisRecord {
  id: string;
  resumeId: string | null;
  targetRole: string;
  jobDescription: string | null;
  readinessScore: number;
  report: SkillGapReport;
  generatedBy: 'AI_GENERATED' | 'CURATED_FALLBACK';
  createdAt: string;
}
