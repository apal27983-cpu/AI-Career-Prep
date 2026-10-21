import type { ContentSource, Prisma } from '@prisma/client';
import type { ResumeFitReport, ResumeQualityChecks } from '@career-prep/shared';
import { prisma } from '../config/prisma.js';

export async function createFitAnalysis(input: {
  userId: string;
  resumeId: string;
  targetRole: string;
  jobDescription: string | null;
  report: ResumeFitReport;
  checks: ResumeQualityChecks;
  matchScore: number;
  generatedBy: ContentSource;
}) {
  return prisma.resumeFitAnalysis.create({
    data: {
      userId: input.userId,
      resumeId: input.resumeId,
      targetRole: input.targetRole,
      jobDescription: input.jobDescription,
      reportData: input.report as unknown as Prisma.InputJsonValue,
      checksData: input.checks as unknown as Prisma.InputJsonValue,
      matchScore: input.matchScore,
      generatedBy: input.generatedBy,
    },
  });
}

/** Scoped by userId so another account's report is simply not found. */
export async function latestFitForResume(userId: string, resumeId: string) {
  return prisma.resumeFitAnalysis.findFirst({
    where: { userId, resumeId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listFitAnalyses(userId: string, limit = 20) {
  return prisma.resumeFitAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
