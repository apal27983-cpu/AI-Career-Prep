import { z } from 'zod';
import { LIMITS, PROCESSING_STATUSES } from '../constants.js';

const optionalText = (max: number) => z.string().trim().max(max).nullable();

/**
 * Everything here is nullable on purpose: resumes do not follow one layout, and
 * a confidently wrong guess is worse than an empty field the candidate fixes.
 */
export const parsedResumeSchema = z.object({
  candidateName: optionalText(LIMITS.nameMax),
  email: optionalText(254),
  phone: optionalText(40),
  summary: optionalText(3000),
  education: z.array(z.string().trim().max(500)).max(20),
  workExperience: z.array(z.string().trim().max(1500)).max(40),
  projects: z.array(z.string().trim().max(1500)).max(40),
  skills: z.array(z.string().trim().max(LIMITS.skillMax)).max(120),
  certifications: z.array(z.string().trim().max(300)).max(40),
  achievements: z.array(z.string().trim().max(500)).max(40),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const emptyParsedResume = (): ParsedResume => ({
  candidateName: null,
  email: null,
  phone: null,
  summary: null,
  education: [],
  workExperience: [],
  projects: [],
  skills: [],
  certifications: [],
  achievements: [],
});

/** Payload for the editable preview the candidate corrects after parsing. */
export const updateResumeSchema = z.object({
  parsedData: parsedResumeSchema,
});

export type UpdateResumeInput = z.infer<typeof updateResumeSchema>;

export interface ResumeSummary {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  processingStatus: (typeof PROCESSING_STATUSES)[number];
  processingError: string | null;
  textLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail extends ResumeSummary {
  extractedText: string;
  parsedData: ParsedResume;
}
