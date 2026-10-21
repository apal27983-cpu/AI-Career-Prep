import type { Request, Response } from 'express';
import type { CandidateProfile, ProfileInput } from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { getProfile, upsertProfile } from '../repositories/profile.repository.js';

type ProfileRow = Awaited<ReturnType<typeof getProfile>>;

function toDto(row: NonNullable<ProfileRow>): CandidateProfile {
  return {
    id: row.id,
    fullName: row.fullName,
    currentRole: row.currentRole,
    targetRole: row.targetRole,
    experienceLevel: row.experienceLevel,
    yearsOfExperience: row.yearsOfExperience,
    education: row.education,
    skills: row.skills,
    learningGoals: row.learningGoals,
    preferredInterviewMode: row.preferredInterviewMode,
    targetIndustry: row.targetIndustry,
    careerObjective: row.careerObjective,
    jobDescription: row.jobDescription,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readProfile(req: Request, res: Response): Promise<void> {
  const { id } = currentUser(req);
  const row = await getProfile(id);
  sendSuccess(res, { profile: row ? toDto(row) : null });
}

export async function writeProfile(req: Request, res: Response): Promise<void> {
  const { id } = currentUser(req);
  const row = await upsertProfile(id, req.body as ProfileInput);
  sendSuccess(res, { profile: toDto(row) }, 'Your career profile has been saved.');
}
