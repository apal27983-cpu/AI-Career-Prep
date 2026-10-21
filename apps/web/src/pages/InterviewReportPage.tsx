import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Target, TrendingUp } from 'lucide-react';
import {
  AI_ESTIMATE_DISCLAIMER,
  DIFFICULTY_LABELS,
  INTERVIEW_MODE_LABELS,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, ScoreBar } from '../components/ui/States';
import { LinkButton } from '../components/ui/Button';
import { FeedbackPanel } from '../components/feature/FeedbackPanel';
import { useAsyncQuery } from '../hooks/useAsync';
import { interviewApi } from '../services/endpoints';

export function InterviewReportPage() {
  const { sessionId = '' } = useParams();
  const query = useAsyncQuery(
    () => interviewApi.report(sessionId).then((result) => result.data.session),
    [sessionId],
  );

  if (query.loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="space-y-4">
        <ErrorState
          error={query.error ?? new Error('Report not found')}
          onRetry={() => void query.reload()}
        />
        <LinkButton to="/history" variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
          Back to history
        </LinkButton>
      </div>
    );
  }

  const session = query.data;
  const questionById = new Map(session.questions.map((question) => [question.id, question]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/history"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Interview history
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {INTERVIEW_MODE_LABELS[session.mode]} report
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {session.targetRole} · {DIFFICULTY_LABELS[session.difficulty]} ·{' '}
          {new Date(session.createdAt).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Summary"
          action={
            <Badge tone={session.status === 'COMPLETED' ? 'success' : 'neutral'}>
              {session.status === 'COMPLETED' ? 'Completed' : 'Closed early'}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ScoreBar
              label="Average score across answers"
              value={session.averageScore ?? 0}
              tone="brand"
            />
            <div className="text-sm text-slate-700">
              <p>
                <span className="font-medium">{session.completedQuestions}</span> of{' '}
                <span className="font-medium">{session.totalQuestions}</span> questions answered
              </p>
              {session.completedAt ? (
                <p className="mt-1 text-slate-500">
                  Finished {new Date(session.completedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>

          {session.finalSummary ? (
            <div className="space-y-4">
              <p className="text-base font-semibold text-slate-900">
                {session.finalSummary.headline}
              </p>
              <p className="text-sm text-slate-700">{session.finalSummary.overallAssessment}</p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-slate-900">Top strengths</p>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {session.finalSummary.topStrengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-slate-900">Focus areas</p>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {session.finalSummary.focusAreas.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-slate-900">Next steps</p>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {session.finalSummary.recommendedNextSteps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              No summary was generated for this session, because no answers were submitted.
            </p>
          )}

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {AI_ESTIMATE_DISCLAIMER}
          </p>

          <div className="flex flex-wrap gap-2">
            <LinkButton to="/interview" size="sm" icon={<TrendingUp className="h-4 w-4" />}>
              Practise again
            </LinkButton>
            <LinkButton
              to="/skill-gap"
              variant="secondary"
              size="sm"
              icon={<Target className="h-4 w-4" />}
            >
              Update skill gap analysis
            </LinkButton>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Answer by answer</h2>
        {session.answers.length === 0 ? (
          <Card>
            <EmptyState
              title="No answers to review"
              description="This session was closed before any answer was submitted."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {session.answers.map((answer, index) => {
              const question = questionById.get(answer.questionId);
              return (
                <div key={answer.id} className="space-y-3">
                  <Card>
                    <CardHeader
                      title={`Question ${index + 1}${question ? ` - ${question.topic}` : ''}`}
                      action={
                        question ? (
                          <Badge tone={question.source === 'AI_GENERATED' ? 'brand' : 'warning'}>
                            {question.source === 'AI_GENERATED' ? 'AI generated' : 'Curated'}
                          </Badge>
                        ) : null
                      }
                    />
                    <CardBody className="space-y-3">
                      {question ? (
                        <p className="whitespace-pre-wrap text-sm font-medium text-slate-900">
                          {question.questionText}
                        </p>
                      ) : null}
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Your answer
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-slate-700">
                          {answer.answerText}
                        </p>
                      </div>
                    </CardBody>
                  </Card>
                  <FeedbackPanel evaluation={answer.evaluation} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
