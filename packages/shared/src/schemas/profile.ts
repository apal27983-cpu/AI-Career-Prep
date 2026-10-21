import { z } from 'zod';
import { EXPERIENCE_LEVELS, INTERVIEW_MODES, LIMITS } from '../constants.js';

const skillListSchema = z
  .array(z.string().trim().min(1).max(LIMITS.skillMax))
  .max(LIMITS.maxSkills, `Please list at most ${LIMITS.maxSkills} skills`)
  .transform((skills) => {
    // De-duplicate case-insensitively while keeping the user's own casing.
    const seen = new Set<string>();
    return skills.filter((skill) => {
      const key = skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

export const profileInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(LIMITS.nameMin, 'Enter your full name')
    .max(LIMITS.nameMax, 'Name is too long'),
  currentRole: z
    .string()
    .trim()
    .min(2, 'Tell us your current role or student status')
    .max(LIMITS.targetRoleMax, 'This is too long'),
  targetRole: z
    .string()
    .trim()
    .min(2, 'Enter the role you are preparing for')
    .max(LIMITS.targetRoleMax, 'This is too long'),
  experienceLevel: z.enum(EXPERIENCE_LEVELS, { message: 'Select your experience level' }),
  yearsOfExperience: z
    .number({ message: 'Enter a number of years' })
    .int('Use whole years')
    .min(0, 'Cannot be negative')
    .max(60, 'Enter 60 or fewer years'),
  education: z.string().trim().min(2, 'Add your highest education').max(300, 'This is too long'),
  skills: skillListSchema.refine((skills) => skills.length > 0, 'Add at least one skill'),
  learningGoals: skillListSchema,
  preferredInterviewMode: z.enum(INTERVIEW_MODES, { message: 'Select a preferred mode' }),
  targetIndustry: z.string().trim().max(120, 'This is too long').optional().default(''),
  careerObjective: z
    .string()
    .trim()
    .max(LIMITS.careerObjectiveMax, 'Please keep this under 1500 characters')
    .optional()
    .default(''),
  jobDescription: z
    .string()
    .trim()
    .max(LIMITS.jobDescriptionMax, 'Job description is too long')
    .optional()
    .default(''),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface CandidateProfile extends ProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
