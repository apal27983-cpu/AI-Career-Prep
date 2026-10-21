import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Ruler,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import {
  AI_ESTIMATE_DISCLAIMER,
  type FitSeverity,
  type ResumeFitRecord,
  type ResumeQualityChecks,
  type SectionStatus,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Badge, ScoreBar, type BadgeTone } from '../ui/States';
import { cn } from '../../utils/cn';

const SEVERITY_TONE: Record<FitSeverity, BadgeTone> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

const SEVERITY_LABEL: Record<FitSeverity, string> = {
  HIGH: 'Fix first',
  MEDIUM: 'Worth fixing',
  LOW: 'Nice to have',
};

const STATUS_ICON: Record<SectionStatus, typeof CheckCircle2> = {
  GOOD: CheckCircle2,
  NEEDS_WORK: CircleAlert,
  MISSING: XCircle,
};

const STATUS_COLOUR: Record<SectionStatus, string> = {
  GOOD: 'text-emerald-600',
  NEEDS_WORK: 'text-amber-600',
  MISSING: 'text-red-600',
};

const STATUS_LABEL: Record<SectionStatus, string> = {
  GOOD: 'Present',
  NEEDS_WORK: 'Needs work',
  MISSING: 'Missing',
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Objective facts measured from the document by code. Shown separately from the
 * AI commentary and deliberately not labelled an estimate, because they are not.
 */
function MeasuredChecks({ checks }: { checks: ResumeQualityChecks }) {
  const rows: Array<{ label: string; value: string; ok: boolean }> = [
    {
      label: 'Professional summary',
      value: checks.hasSummary ? 'Present' : 'Missing',
      ok: checks.hasSummary,
    },
    {
      label: 'Contact details',
      value: checks.contactComplete
        ? 'Complete'
        : `Missing ${checks.missingContactFields.join(', ')}`,
      ok: checks.contactComplete,
    },
    {
      label: 'Bullets with a number',
      value: `${checks.quantifiedBulletCount} of ${checks.bulletCount} (${percent(checks.quantifiedBulletRatio)})`,
      ok: checks.quantifiedBulletRatio >= 0.3,
    },
    {
      label: 'Bullets led by an action verb',
      value: percent(checks.actionVerbRatio),
      ok: checks.actionVerbRatio >= 0.5,
    },
    { label: 'Skills listed', value: String(checks.skillCount), ok: checks.skillCount >= 5 },
    {
      label: 'Longest bullet',
      value: `${checks.longestBulletWords} words`,
      ok: checks.longestBulletWords > 0 && checks.longestBulletWords <= 40,
    },
    { label: 'Total length', value: `${checks.wordCount} words`, ok: checks.wordCount >= 250 },
    {
      label: 'Achievements section',
      value: checks.hasAchievements ? 'Present' : 'Missing',
      ok: checks.hasAchievements,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Measured from your file"
        description="Counted directly from the document - these are facts, not estimates."
      />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0"
            >
              <dt className="flex items-center gap-2 text-sm text-slate-700">
                {row.ok ? (
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                {row.label}
              </dt>
              <dd
                className={cn(
                  'text-sm font-medium tabular-nums',
                  row.ok ? 'text-slate-900' : 'text-amber-800',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

export function ResumeFitReportView({ fit }: { fit: ResumeFitRecord }) {
  const { report, checks } = fit;
  const highGaps = report.gaps.filter((gap) => gap.severity === 'HIGH');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Fit for ${report.targetRole}`}
          description={`Reviewed ${new Date(fit.createdAt).toLocaleString()}`}
          action={
            <Badge tone={fit.generatedBy === 'AI_GENERATED' ? 'brand' : 'warning'}>
              {fit.generatedBy === 'AI_GENERATED' ? 'AI review' : 'Structural check only'}
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          <ScoreBar label="Resume match score" value={report.matchScore} tone="brand" />
          <p className="text-base font-medium text-slate-900">{report.verdict}</p>
          <p className="text-sm text-slate-700">{report.summary}</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {AI_ESTIMATE_DISCLAIMER}
          </p>
        </CardBody>
      </Card>

      {report.prioritisedFixes.length > 0 ? (
        <Card className="border-brand-200">
          <CardHeader
            title="Fix these first"
            description="The edits that move the needle most for this role."
          />
          <CardBody>
            <ol className="space-y-4">
              {report.prioritisedFixes.map((fix, index) => (
                <li key={fix.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{fix.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{fix.why}</p>
                    <p className="mt-1.5 rounded-md bg-brand-50 px-2.5 py-2 text-sm text-brand-900">
                      {fix.how}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="What works for this role"
            description={`${report.strengths.length} found`}
          />
          <CardBody>
            {report.strengths.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nothing in the resume clearly supports this role yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {report.strengths.map((strength) => (
                  <li key={strength.title} className="flex gap-2">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{strength.title}</p>
                      <p className="mt-0.5 text-sm text-slate-700">{strength.detail}</p>
                      {strength.evidence ? (
                        <p className="mt-1 border-l-2 border-emerald-200 pl-2 text-xs italic text-slate-600">
                          &ldquo;{strength.evidence}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What is missing or weak"
            description={
              highGaps.length > 0
                ? `${highGaps.length} to fix first`
                : `${report.gaps.length} to look at`
            }
          />
          <CardBody>
            {report.gaps.length === 0 ? (
              <p className="text-sm text-slate-600">No significant gaps were identified.</p>
            ) : (
              <ul className="space-y-4">
                {report.gaps.map((gap) => (
                  <li key={gap.title} className="flex gap-2">
                    <TriangleAlert
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        gap.severity === 'HIGH' ? 'text-red-600' : 'text-amber-600',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{gap.title}</span>
                        <Badge tone={SEVERITY_TONE[gap.severity]}>
                          {SEVERITY_LABEL[gap.severity]}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-sm text-slate-700">{gap.detail}</p>
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-900">
                        <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                        {gap.fix}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <MeasuredChecks checks={checks} />

      {report.sectionFeedback.length > 0 ? (
        <Card>
          <CardHeader title="Section by section" />
          <CardBody>
            <ul className="space-y-3">
              {report.sectionFeedback.map((entry) => {
                const Icon = STATUS_ICON[entry.status];
                return (
                  <li key={entry.section} className="flex gap-2">
                    <Icon
                      aria-hidden="true"
                      className={cn('mt-0.5 h-4 w-4 shrink-0', STATUS_COLOUR[entry.status])}
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                        {entry.section}
                        <span className={cn('text-xs font-normal', STATUS_COLOUR[entry.status])}>
                          {STATUS_LABEL[entry.status]}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-slate-700">{entry.comment}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {report.matchedKeywords.length > 0 || report.missingKeywords.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Role terms your resume shows"
              description={`${report.matchedKeywords.length} matched`}
            />
            <CardBody>
              {report.matchedKeywords.length === 0 ? (
                <p className="text-sm text-slate-600">None were matched.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {report.matchedKeywords.map((keyword) => (
                    <li key={keyword}>
                      <Badge tone="success">{keyword}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Role terms it does not"
              description="Add the ones you genuinely have."
            />
            <CardBody>
              {report.missingKeywords.length === 0 ? (
                <p className="text-sm text-slate-600">Nothing obvious is missing.</p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-1.5">
                    {report.missingKeywords.map((keyword) => (
                      <li key={keyword}>
                        <Badge tone="warning">{keyword}</Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                    <CircleDashed aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Only add a term if you can back it up in an interview.
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Ruler aria-hidden="true" className="h-3.5 w-3.5" />
        The match score is an AI estimate of how well this document presents you for this role. It
        is not a measure of your ability, and not a prediction of whether you will be hired.
      </p>
    </div>
  );
}
