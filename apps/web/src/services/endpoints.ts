import type {
  AnalyzeResumeFitInput,
  AnalyzeSkillGapInput,
  AuthenticatedUser,
  CandidateProfile,
  ChangePasswordInput,
  CreateInterviewInput,
  DashboardStats,
  InterviewAnswerRecord,
  InterviewSessionDetail,
  InterviewSessionSummary,
  LoginInput,
  ParsedResume,
  ProfileInput,
  PublicInterviewQuestion,
  RegisterInput,
  ResumeDetail,
  ResumeFitRecord,
  ResumeSummary,
  SkillGapAnalysisRecord,
  SubmitAnswerInput,
} from '@career-prep/shared';
import { http, progressHandler, request, type UploadProgressHandler } from './api';

/* --- Auth ---------------------------------------------------------------- */

interface AuthPayload {
  user: AuthenticatedUser;
  csrfToken: string | null;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthPayload>(http.post('/auth/register', input)),
  login: (input: LoginInput) => request<AuthPayload>(http.post('/auth/login', input)),
  logout: () => request<{ loggedOut: boolean }>(http.post('/auth/logout')),
  me: () => request<AuthPayload>(http.get('/auth/me')),
  changePassword: (input: ChangePasswordInput) =>
    request<{ csrfToken: string }>(http.put('/auth/password', input)),
  deleteAccount: () => request<{ deleted: boolean }>(http.delete('/auth/account')),
};

/* --- Profile ------------------------------------------------------------- */

export const profileApi = {
  get: () => request<{ profile: CandidateProfile | null }>(http.get('/profile')),
  save: (input: ProfileInput) =>
    request<{ profile: CandidateProfile }>(http.put('/profile', input)),
};

/* --- Dashboard ----------------------------------------------------------- */

export const dashboardApi = {
  get: () => request<DashboardStats>(http.get('/dashboard')),
};

/* --- Resumes ------------------------------------------------------------- */

export const resumeApi = {
  list: () => request<{ resumes: ResumeSummary[] }>(http.get('/resumes')),
  get: (resumeId: string) =>
    request<{ resume: ResumeDetail }>(http.get(`/resumes/${resumeId}`)),
  upload: (file: File, onProgress?: UploadProgressHandler) => {
    const form = new FormData();
    form.append('resume', file);
    return request<{ resume: ResumeDetail }>(
      http.post('/resumes/upload', form, {
        // Let the browser set the multipart boundary.
        headers: { 'Content-Type': undefined },
        onUploadProgress: progressHandler(onProgress),
      }),
    );
  },
  updateParsed: (resumeId: string, parsedData: ParsedResume) =>
    request<{ resume: ResumeDetail }>(http.put(`/resumes/${resumeId}`, { parsedData })),
  remove: (resumeId: string) =>
    request<{ deleted: boolean }>(http.delete(`/resumes/${resumeId}`)),

  /** Re-runs extraction over the stored text. Discards manual corrections. */
  reparse: (resumeId: string) =>
    request<{ resume: ResumeDetail }>(http.post(`/resumes/${resumeId}/reparse`)),

  /** Runs the "how well does this resume fit this role?" review. */
  analyzeFit: (resumeId: string, input: AnalyzeResumeFitInput) =>
    request<{ fit: ResumeFitRecord }>(http.post(`/resumes/${resumeId}/fit`, input)),

  /** The most recent review for a resume, or null if none has been run. */
  latestFit: (resumeId: string) =>
    request<{ fit: ResumeFitRecord | null }>(http.get(`/resumes/${resumeId}/fit`)),
};

/* --- Skill gap ----------------------------------------------------------- */

export interface AnalysisHistoryItem {
  id: string;
  targetRole: string;
  readinessScore: number;
  generatedBy: 'AI_GENERATED' | 'CURATED_FALLBACK';
  resumeId: string | null;
  createdAt: string;
}

export const skillGapApi = {
  analyze: (input: AnalyzeSkillGapInput) =>
    request<{ analysis: SkillGapAnalysisRecord }>(http.post('/skill-gap/analyze', input)),
  history: () => request<{ analyses: AnalysisHistoryItem[] }>(http.get('/skill-gap/history')),
  get: (analysisId: string) =>
    request<{ analysis: SkillGapAnalysisRecord }>(http.get(`/skill-gap/${analysisId}`)),
};

/* --- Interviews ---------------------------------------------------------- */

export const interviewApi = {
  create: (input: CreateInterviewInput) =>
    request<{ session: InterviewSessionDetail }>(http.post('/interviews', input)),
  list: () => request<{ sessions: InterviewSessionSummary[] }>(http.get('/interviews')),
  get: (sessionId: string) =>
    request<{ session: InterviewSessionDetail }>(http.get(`/interviews/${sessionId}`)),
  nextQuestion: (sessionId: string) =>
    request<{ question: PublicInterviewQuestion; generated: boolean }>(
      http.post(`/interviews/${sessionId}/next-question`),
    ),
  submitAnswer: (sessionId: string, input: SubmitAnswerInput) =>
    request<{ answer: InterviewAnswerRecord; duplicate: boolean }>(
      http.post(`/interviews/${sessionId}/answer`, input),
    ),
  complete: (sessionId: string) =>
    request<{ session: InterviewSessionDetail | null }>(
      http.post(`/interviews/${sessionId}/complete`),
    ),
  report: (sessionId: string) =>
    request<{ session: InterviewSessionDetail }>(http.get(`/interviews/${sessionId}/report`)),
};
