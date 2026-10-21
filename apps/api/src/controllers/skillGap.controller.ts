import type { Request, Response } from 'express';
import {
  parsedResumeSchema,
  skillGapReportSchema,
  type AnalyzeSkillGapInput,
  type SkillGapAnalysisRecord,
} from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { AppError, notFound } from '../utils/errors.js';
import { getProfile } from '../repositories/profile.repository.js';
import { findResumeForUser, latestCompletedResume } from '../repositories/resume.repository.js';
import {
  createAnalysis,
  findAnalysisForUser,
  listAnalyses,
} from '../repositories/analysis.repository.js';
import {
  analyseSkillGaps,
  hasEnoughInputs,
  type SkillGapInputs,
} from '../services/skillGap.service.js';
import { logger } from '../utils/logger.js';

type AnalysisRow = NonNullable<Awaited<ReturnType<typeof findAnalysisForUser>>>;

function toDto(row: AnalysisRow): SkillGapAnalysisRecord {
  const parsed = skillGapReportSchema.safeParse(row.analysisData);
  if (!parsed.success) {
    // A row that no longer matches the schema is a server-side problem.
    throw new AppError('INTERNAL_ERROR', 'That report could not be loaded. Please run a new analysis.', {
      logContext: { analysisId: row.id, reason: 'stored_report_invalid' },
    });
  }

  return {
    id: row.id,
    resumeId: row.resumeId,
    targetRole: row.targetRole,
    jobDescription: row.jobDescription,
    readinessScore: row.readinessScore,
    report: parsed.data,
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function analyze(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const body = req.body as AnalyzeSkillGapInput;

  const profile = await getProfile(userId);
  if (!profile) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Complete your career profile before running a skill gap analysis.',
    );
  }

  // An explicit resumeId is checked against the user; otherwise take their latest.
  const resume = body.resumeId
    ? await findResumeForUser(userId, body.resumeId)
    : await latestCompletedResume(userId);

  if (body.resumeId && !resume) {
    throw notFound('That resume could not be found.');
  }

  const resumeSkills = resume
    ? (parsedResumeSchema.safeParse(resume.parsedData).data?.skills ?? [])
    : [];

  const confirmedSkills =
    body.skills.length > 0 ? body.skills : [...new Set([...profile.skills, ...resumeSkills])];

  const inputs: SkillGapInputs = {
    targetRole: body.targetRole,
    jobDescription: body.jobDescription || profile.jobDescription || '',
    experienceLevel: profile.experienceLevel,
    yearsOfExperience: profile.yearsOfExperience,
    currentRole: profile.currentRole,
    confirmedSkills: confirmedSkills.slice(0, 50),
    resumeText: resume?.extractedText ?? '',
    resumeSkills,
    learningGoals: profile.learningGoals,
  };

  if (!hasEnoughInputs(inputs)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'We need either a parsed resume or at least one skill on your profile before analysing gaps.',
    );
  }

  const result = await analyseSkillGaps(userId, inputs);

  const row = await createAnalysis({
    userId,
    resumeId: resume?.id ?? null,
    targetRole: inputs.targetRole,
    jobDescription: inputs.jobDescription || null,
    report: result.data,
    readinessScore: result.data.readinessScore,
    generatedBy: result.source,
  });

  logger.info(
    { userId, analysisId: row.id, source: result.source, repairAttempts: result.repairAttempts },
    'Skill gap analysis generated',
  );

  sendSuccess(
    res,
    { analysis: toDto(row) },
    result.source === 'AI_GENERATED'
      ? 'Your skill gap report is ready.'
      : 'Your baseline report is ready. AI analysis was unavailable, so this is a checklist-based report.',
    201,
  );
}

export async function history(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const rows = await listAnalyses(userId);
  sendSuccess(res, {
    analyses: rows.map((row) => ({
      id: row.id,
      targetRole: row.targetRole,
      readinessScore: row.readinessScore,
      generatedBy: row.generatedBy,
      resumeId: row.resumeId,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export async function getAnalysis(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const row = await findAnalysisForUser(userId, req.params.analysisId as string);
  if (!row) throw notFound('That report could not be found.');
  sendSuccess(res, { analysis: toDto(row) });
}
