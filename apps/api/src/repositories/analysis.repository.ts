import type { ContentSource, Prisma } from '@prisma/client';
import type { SkillGapReport } from '@career-prep/shared';
import { prisma } from '../config/prisma.js';

export async function createAnalysis(input: {
  userId: string;
  resumeId: string | null;
  targetRole: string;
  jobDescription: string | null;
  report: SkillGapReport;
  readinessScore: number;
  generatedBy: ContentSource;
}) {
  return prisma.skillGapAnalysis.create({
    data: {
      userId: input.userId,
      resumeId: input.resumeId,
      targetRole: input.targetRole,
      jobDescription: input.jobDescription,
      analysisData: input.report as unknown as Prisma.InputJsonValue,
      readinessScore: input.readinessScore,
      generatedBy: input.generatedBy,
    },
  });
}

export async function listAnalyses(userId: string, limit = 25) {
  return prisma.skillGapAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function findAnalysisForUser(userId: string, analysisId: string) {
  return prisma.skillGapAnalysis.findFirst({ where: { id: analysisId, userId } });
}

export async function latestAnalysis(userId: string) {
  return prisma.skillGapAnalysis.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function countAnalyses(userId: string) {
  return prisma.skillGapAnalysis.count({ where: { userId } });
}
