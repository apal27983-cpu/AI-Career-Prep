import type { InterviewMode } from './constants.js';
import type { InterviewSessionSummary } from './schemas/interview.js';

/** Everything the dashboard renders. Populated only from the signed-in user's records. */
export interface DashboardStats {
  targetRole: string | null;
  hasProfile: boolean;
  resumeCount: number;
  latestResume: {
    id: string;
    originalFilename: string;
    processingStatus: string;
    createdAt: string;
  } | null;
  latestReadinessScore: number | null;
  latestAnalysisId: string | null;
  analysisCount: number;
  interviewsCompleted: number;
  interviewsInProgress: number;
  answersEvaluated: number;
  averageInterviewScore: number | null;
  scoreByMode: Array<{ mode: InterviewMode; averageScore: number; sessions: number }>;
  scoreTrend: Array<{ label: string; score: number }>;
  recentSessions: InterviewSessionSummary[];
  recommendedNextSteps: string[];
}
