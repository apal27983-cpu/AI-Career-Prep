import type { Request, Response } from 'express';
import {
  parsedResumeSchema,
  resumeFitReportSchema,
  type AnalyzeResumeFitInput,
  type ResumeFitRecord,
  type ResumeQualityChecks,
} from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { AppError, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { findResumeForUser } from '../repositories/resume.repository.js';
import { getProfile } from '../repositories/profile.repository.js';
import {
  createFitAnalysis,
  latestFitForResume,
} from '../repositories/resumeFit.repository.js';
import { analyseResumeFit } from '../services/resumeFit.service.js';
import { computeResumeQuality } from '../services/resumeQuality.service.js';

type FitRow = NonNullable<Awaited<ReturnType<typeof latestFitForResume>>>;

function toDto(row: FitRow): ResumeFitRecord {
  const report = resumeFitReportSchema.safeParse(row.reportData);
  if (!report.success) {
    throw new AppError('INTERNAL_ERROR', 'That report could not be loaded. Please run it again.', {
      logContext: { fitId: row.id, reason: 'stored_report_invalid' },
    });
  }

  return {
    id: row.id,
    resumeId: row.resumeId,
    targetRole: row.targetRole,
    jobDescription: row.jobDescription,
    matchScore: row.matchScore,
    report: report.data,
    checks: row.checksData as unknown as ResumeQualityChecks,
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Runs the analysis for one resume against a target role. */
export async function analyzeFit(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const resumeId = req.params.resumeId as string;
  const body = req.body as AnalyzeResumeFitInput;

  const resume = await findResumeForUser(userId, resumeId);
  if (!resume) throw notFound('That resume could not be found.');

  if (resume.processingStatus !== 'COMPLETED' || resume.extractedText.trim().length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'That resume has no extracted text yet. Upload a text-based PDF or DOCX first.',
    );
  }

  const parsed = parsedResumeSchema.safeParse(resume.parsedData);
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'That resume could not be read. Please upload it again.', {
      logContext: { resumeId, reason: 'parsed_data_invalid' },
    });
  }

  const profile = await getProfile(userId);
  const checks = computeResumeQuality(parsed.data, resume.extractedText);

  const result = await analyseResumeFit(userId, {
    targetRole: body.targetRole,
    jobDescription: body.jobDescription || profile?.jobDescription || '',
    resumeText: resume.extractedText,
    parsed: parsed.data,
    checks,
    profileSkills: profile?.skills ?? [],
  });

  const row = await createFitAnalysis({
    userId,
    resumeId,
    targetRole: body.targetRole,
    jobDescription: body.jobDescription || null,
    report: result.data,
    checks,
    matchScore: result.data.matchScore,
    generatedBy: result.source,
  });

  logger.info(
    { userId, resumeId, fitId: row.id, source: result.source, matchScore: result.data.matchScore },
    'Resume fit analysis generated',
  );

  sendSuccess(
    res,
    { fit: toDto(row) },
    result.source === 'AI_GENERATED'
      ? 'Your resume review is ready.'
      : 'AI review was unavailable, so this covers the structural checks only.',
    201,
  );
}

/** Returns the most recent report for a resume, or null if none has been run. */
export async function getLatestFit(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const resumeId = req.params.resumeId as string;

  const resume = await findResumeForUser(userId, resumeId);
  if (!resume) throw notFound('That resume could not be found.');

  const row = await latestFitForResume(userId, resumeId);
  sendSuccess(res, { fit: row ? toDto(row) : null });
}
