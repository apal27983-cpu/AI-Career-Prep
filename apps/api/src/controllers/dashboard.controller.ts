import type { Request, Response } from 'express';
import type { DashboardStats } from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { getProfile } from '../repositories/profile.repository.js';
import { countResumes, listResumesForUser } from '../repositories/resume.repository.js';
import { countAnalyses, latestAnalysis } from '../repositories/analysis.repository.js';
import { interviewStats, listSessionsForUser } from '../repositories/interview.repository.js';

/** Every number here comes from the signed-in user's own rows. Nothing is seeded. */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);

  const [profile, resumes, resumeCount, analysis, analysisCount, stats, sessions] =
    await Promise.all([
      getProfile(userId),
      listResumesForUser(userId),
      countResumes(userId),
      latestAnalysis(userId),
      countAnalyses(userId),
      interviewStats(userId),
      listSessionsForUser(userId, 5),
    ]);

  const latestResume = resumes[0] ?? null;

  const recentSessions = sessions.map((row) => ({
    id: row.id,
    mode: row.mode,
    targetRole: row.targetRole,
    experienceLevel: row.experienceLevel,
    difficulty: row.difficulty,
    status: row.status,
    totalQuestions: row.totalQuestions,
    completedQuestions: row.completedQuestions,
    averageScore: row.averageScore,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }));

  // Oldest first, so the trend chart reads left to right.
  const scoreTrend = [...sessions]
    .filter((row) => row.averageScore !== null)
    .reverse()
    .map((row) => ({
      label: row.createdAt.toISOString().slice(0, 10),
      score: row.averageScore as number,
    }));

  const recommendedNextSteps: string[] = [];
  if (!profile) {
    recommendedNextSteps.push('Complete your career profile so analyses and questions fit your target role.');
  }
  if (resumeCount === 0) {
    recommendedNextSteps.push('Upload a PDF or DOCX resume to unlock the skill gap analysis.');
  } else if (!analysis) {
    recommendedNextSteps.push('Run your first skill gap analysis against your target role.');
  }
  if (stats.completed === 0) {
    recommendedNextSteps.push('Try a short 5-question practice interview to get a baseline.');
  }
  if (stats.inProgress > 0) {
    recommendedNextSteps.push('You have an interview in progress - finish it to get your report.');
  }
  if (recommendedNextSteps.length === 0) {
    recommendedNextSteps.push(
      'Run a practice interview in your weakest mode, then re-run the skill gap analysis to see the change.',
    );
  }

  const payload: DashboardStats = {
    targetRole: profile?.targetRole ?? null,
    hasProfile: profile !== null,
    resumeCount,
    latestResume: latestResume
      ? {
          id: latestResume.id,
          originalFilename: latestResume.originalFilename,
          processingStatus: latestResume.processingStatus,
          createdAt: latestResume.createdAt.toISOString(),
        }
      : null,
    latestReadinessScore: analysis?.readinessScore ?? null,
    latestAnalysisId: analysis?.id ?? null,
    analysisCount,
    interviewsCompleted: stats.completed,
    interviewsInProgress: stats.inProgress,
    answersEvaluated: stats.answers._count,
    averageInterviewScore:
      stats.answers._avg.overallScore === null
        ? null
        : Math.round(stats.answers._avg.overallScore),
    scoreByMode: stats.byMode.map((row) => ({
      mode: row.mode,
      averageScore: Math.round(row._avg.averageScore ?? 0),
      sessions: row._count,
    })),
    scoreTrend,
    recentSessions,
    recommendedNextSteps,
  };

  sendSuccess(res, payload);
}
