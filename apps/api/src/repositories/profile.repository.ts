import type { ProfileInput } from '@career-prep/shared';
import { prisma } from '../config/prisma.js';

export async function getProfile(userId: string) {
  return prisma.candidateProfile.findUnique({ where: { userId } });
}

/**
 * Upsert keyed on userId. The user id comes from the session, never from the
 * request body, so a client cannot write to somebody else's profile.
 */
export async function upsertProfile(userId: string, input: ProfileInput) {
  const data = {
    fullName: input.fullName,
    currentRole: input.currentRole,
    targetRole: input.targetRole,
    experienceLevel: input.experienceLevel,
    yearsOfExperience: input.yearsOfExperience,
    education: input.education,
    skills: input.skills,
    learningGoals: input.learningGoals,
    preferredInterviewMode: input.preferredInterviewMode,
    targetIndustry: input.targetIndustry ?? '',
    careerObjective: input.careerObjective ?? '',
    jobDescription: input.jobDescription ?? '',
  };

  return prisma.candidateProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
