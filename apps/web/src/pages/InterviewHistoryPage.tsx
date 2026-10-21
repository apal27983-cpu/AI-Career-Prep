import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { DIFFICULTY_LABELS, INTERVIEW_MODE_LABELS } from '@career-prep/shared';
import { Card, CardHeader, SkeletonCard } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState } from '../components/ui/States';
import { LinkButton } from '../components/ui/Button';
import { useAsyncQuery } from '../hooks/useAsync';
import { interviewApi } from '../services/endpoints';

const STATUS = {
  COMPLETED: { label: 'Completed', tone: 'success' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  ABANDONED: { label: 'Closed', tone: 'neutral' },
} as const;

export function InterviewHistoryPage() {
  const query = useAsyncQuery(
    () => interviewApi.list().then((result) => result.data.sessions),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Interview history</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every session you have run, with its score and full report.
          </p>
        </div>
        <LinkButton to="/interview" size="sm">
          New interview
        </LinkButton>
      </div>

      <Card>
        <CardHeader title="Sessions" />
        {query.loading ? (
          <div className="p-5">
            <SkeletonCard lines={4} className="border-0 shadow-none" />
          </div>
        ) : query.error ? (
          <div className="p-5">
            <ErrorState error={query.error} onRetry={() => void query.reload()} />
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="No interviews yet"
            description="Run a practice interview and it will appear here with its report."
            action={<LinkButton to="/interview" size="sm">Start an interview</LinkButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-5 py-3 font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 font-medium">Mode</th>
                  <th scope="col" className="px-5 py-3 font-medium">Target role</th>
                  <th scope="col" className="px-5 py-3 font-medium">Progress</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Score</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(query.data ?? []).map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-slate-900">
                      {INTERVIEW_MODE_LABELS[session.mode]}
                      <span className="block text-xs text-slate-500">
                        {DIFFICULTY_LABELS[session.difficulty]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{session.targetRole}</td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">
                      {session.completedQuestions}/{session.totalQuestions}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS[session.status].tone}>
                        {STATUS[session.status].label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {session.averageScore === null ? '--' : `${session.averageScore}/100`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={
                          session.status === 'IN_PROGRESS'
                            ? `/interview/${session.id}`
                            : `/history/${session.id}`
                        }
                        className="font-medium text-brand-700 hover:text-brand-800"
                      >
                        {session.status === 'IN_PROGRESS' ? 'Resume' : 'View report'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
