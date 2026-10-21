import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  MessagesSquare,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  AI_ESTIMATE_DISCLAIMER,
  DIFFICULTY_LABELS,
  INTERVIEW_MODE_LABELS,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard, StatCard } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, ScoreBar } from '../components/ui/States';
import { LinkButton } from '../components/ui/Button';
import { ScoreByModeChart, ScoreTrendChart } from '../components/feature/charts';
import { useAsyncQuery } from '../hooks/useAsync';
import { dashboardApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

const STATUS_TONE = {
  COMPLETED: 'success',
  IN_PROGRESS: 'brand',
  ABANDONED: 'neutral',
} as const;

const STATUS_LABEL = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  ABANDONED: 'Closed',
} as const;

export function DashboardPage() {
  const { user } = useAuth();
  const query = useAsyncQuery(() => dashboardApi.get().then((result) => result.data), []);

  if (query.loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} lines={1} />
          ))}
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <ErrorState
        error={query.error ?? new Error('Dashboard unavailable')}
        onRetry={() => void query.reload()}
        retrying={query.loading}
      />
    );
  }

  const stats = query.data;
  const isNewUser =
    stats.resumeCount === 0 && stats.interviewsCompleted === 0 && stats.analysisCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {stats.targetRole
              ? `Preparing for: ${stats.targetRole}`
              : 'Add a target role on your profile to personalise everything here.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            to="/skill-gap"
            variant="secondary"
            size="sm"
            icon={<Target className="h-4 w-4" />}
          >
            Skill gap
          </LinkButton>
          <LinkButton to="/interview" size="sm" icon={<MessagesSquare className="h-4 w-4" />}>
            Start interview
          </LinkButton>
        </div>
      </div>

      {isNewUser ? (
        <Card>
          <EmptyState
            icon={<TrendingUp className="h-6 w-6" />}
            title="Nothing to show yet - that is expected"
            description="Upload a resume, run a skill gap analysis, then try a short practice interview. Everything on this page is built from your own records."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton to="/resume" size="sm">
                  Upload a resume
                </LinkButton>
                <LinkButton to="/interview" variant="secondary" size="sm">
                  Try a 5-question interview
                </LinkButton>
              </div>
            }
          />
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Resumes uploaded"
          value={stats.resumeCount}
          hint={
            stats.latestResume
              ? `Latest: ${stats.latestResume.originalFilename}`
              : 'No resume yet'
          }
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Skill readiness"
          value={stats.latestReadinessScore === null ? '--' : `${stats.latestReadinessScore}/100`}
          hint={stats.latestReadinessScore === null ? 'Run an analysis' : 'AI estimate'}
          icon={<Target className="h-5 w-5" />}
        />
        <StatCard
          label="Interviews completed"
          value={stats.interviewsCompleted}
          hint={
            stats.interviewsInProgress > 0
              ? `${stats.interviewsInProgress} in progress`
              : `${stats.answersEvaluated} answers evaluated`
          }
          icon={<MessagesSquare className="h-5 w-5" />}
        />
        <StatCard
          label="Average interview score"
          value={
            stats.averageInterviewScore === null ? '--' : `${stats.averageInterviewScore}/100`
          }
          hint={stats.averageInterviewScore === null ? 'No answers yet' : 'Across all answers'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {stats.latestReadinessScore !== null || stats.averageInterviewScore !== null ? (
        <Card>
          <CardHeader title="Where you stand" description={AI_ESTIMATE_DISCLAIMER} />
          <CardBody className="space-y-4">
            {stats.latestReadinessScore !== null ? (
              <ScoreBar label="Skill readiness for your target role" value={stats.latestReadinessScore} />
            ) : null}
            {stats.averageInterviewScore !== null ? (
              <ScoreBar label="Average interview answer score" value={stats.averageInterviewScore} />
            ) : null}
            {stats.latestAnalysisId ? (
              <Link
                to={`/skill-gap?analysis=${stats.latestAnalysisId}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                Open the full skill gap report
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {stats.scoreByMode.length > 0 || stats.scoreTrend.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {stats.scoreByMode.length > 0 ? (
            <Card>
              <CardBody>
                <ScoreByModeChart data={stats.scoreByMode} />
              </CardBody>
            </Card>
          ) : null}
          {stats.scoreTrend.length > 1 ? (
            <Card>
              <CardBody>
                <ScoreTrendChart data={stats.scoreTrend} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent activity"
            action={
              <Link
                to="/history"
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                View all
              </Link>
            }
          />
          {stats.recentSessions.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title="No practice interviews yet"
              description="Each session you finish shows up here with its score and report."
              action={
                <LinkButton to="/interview" size="sm">
                  Start your first interview
                </LinkButton>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-200">
              {stats.recentSessions.map((session) => (
                <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {INTERVIEW_MODE_LABELS[session.mode]} - {session.targetRole}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {new Date(session.createdAt).toLocaleDateString()} ·{' '}
                      {DIFFICULTY_LABELS[session.difficulty]} · {session.completedQuestions}/
                      {session.totalQuestions} answered
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[session.status]}>{STATUS_LABEL[session.status]}</Badge>
                  <span className="w-14 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {session.averageScore === null ? '--' : session.averageScore}
                  </span>
                  <Link
                    to={
                      session.status === 'IN_PROGRESS'
                        ? `/interview/${session.id}`
                        : `/history/${session.id}`
                    }
                    className="text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {session.status === 'IN_PROGRESS' ? 'Resume' : 'Report'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recommended next steps" />
          <CardBody>
            <ol className="space-y-3">
              {stats.recommendedNextSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-slate-700">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700"
                  >
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
