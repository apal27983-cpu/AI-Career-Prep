import { ArrowRight, CheckCircle2, CircleAlert, Sparkles } from 'lucide-react';
import {
  AI_ESTIMATE_DISCLAIMER,
  SCORE_DIMENSION_LABELS,
  type AnswerEvaluation,
} from '@career-prep/shared';
import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Badge, ScoreBar } from '../ui/States';
import { cn } from '../../utils/cn';

/**
 * The three feedback groups, each with its own colour: green for what went
 * well, red for what did not, blue for what to do next.
 *
 * Colour is reinforcement, never the only signal - each card also carries its
 * own heading, icon and count, so the meaning survives greyscale printing and
 * colour-vision deficiency.
 */
const GROUP_STYLES = {
  strength: {
    card: 'border-emerald-200',
    header: 'border-emerald-200 bg-emerald-50/70',
    title: 'text-emerald-900',
    count: 'bg-emerald-100 text-emerald-800',
  },
  weakness: {
    card: 'border-red-200',
    header: 'border-red-200 bg-red-50/70',
    title: 'text-red-900',
    count: 'bg-red-100 text-red-800',
  },
  improvement: {
    card: 'border-brand-200',
    header: 'border-brand-200 bg-brand-50/70',
    title: 'text-brand-900',
    count: 'bg-brand-100 text-brand-800',
  },
} as const;

type FeedbackGroup = keyof typeof GROUP_STYLES;

function FeedbackCard({
  group,
  title,
  icon,
  count,
  children,
}: {
  group: FeedbackGroup;
  title: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;
}) {
  const style = GROUP_STYLES[group];

  return (
    <Card className={cn('overflow-hidden', style.card)}>
      <div
        className={cn('flex items-center gap-2 border-b px-5 py-3', style.header)}
      >
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
        <h3 className={cn('text-base font-semibold', style.title)}>{title}</h3>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            style.count,
          )}
        >
          {count}
        </span>
      </div>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/**
 * Renders the three mandatory sections of every evaluation - strengths,
 * weaknesses and suggested improvements - and never shows a score without the
 * feedback that explains it.
 */
export function FeedbackPanel({ evaluation }: { evaluation: AnswerEvaluation }) {
  const dimensions = Object.entries(evaluation.scores);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Overall"
          action={
            <Badge
              tone={
                evaluation.generatedBy === 'AI_GENERATED'
                  ? 'brand'
                  : evaluation.generatedBy === 'DETERMINISTIC'
                    ? 'success'
                    : 'warning'
              }
            >
              {evaluation.generatedBy === 'AI_GENERATED'
                ? 'AI feedback'
                : evaluation.generatedBy === 'DETERMINISTIC'
                  ? 'Checked against the answer key'
                  : 'Baseline feedback'}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <ScoreBar label="Overall score" value={evaluation.overallScore} tone="brand" />

          {evaluation.objectiveResult ? (
            <div
              className={
                evaluation.objectiveResult.isCorrect
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3'
                  : 'rounded-lg border border-red-200 bg-red-50 p-3'
              }
            >
              <p className="text-sm font-semibold text-slate-900">
                {evaluation.objectiveResult.isCorrect ? 'Correct' : 'Not correct'}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Expected: {evaluation.objectiveResult.expectedAnswer}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {evaluation.objectiveResult.explanation}
              </p>
            </div>
          ) : null}

          <p className="text-sm text-slate-700">{evaluation.summary}</p>

          {evaluation.insufficientAnswer ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {evaluation.evaluationLimitation ??
                'That answer was too short to evaluate properly. Try answering again in more depth.'}
            </p>
          ) : null}

          {dimensions.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {dimensions.map(([key, value]) => (
                <ScoreBar
                  key={key}
                  label={SCORE_DIMENSION_LABELS[key] ?? key}
                  value={value}
                  max={5}
                />
              ))}
            </div>
          ) : null}

          <p className="text-xs text-slate-500">{AI_ESTIMATE_DISCLAIMER}</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <FeedbackCard
          group="strength"
          title="Strengths"
          count={evaluation.strengths.length}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        >
          {evaluation.strengths.length === 0 ? (
            <p className="text-sm text-slate-600">
              Nothing stood out as a strength in this answer.
            </p>
          ) : (
            <ul className="space-y-3">
              {evaluation.strengths.map((item) => (
                <li key={item.title} className="flex gap-2">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-700">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FeedbackCard>

        <FeedbackCard
          group="weakness"
          title="Weaknesses"
          count={evaluation.weaknesses.length}
          icon={<CircleAlert className="h-5 w-5 text-red-600" />}
        >
          {evaluation.weaknesses.length === 0 ? (
            <p className="text-sm text-slate-600">No specific weaknesses were identified.</p>
          ) : (
            <ul className="space-y-3">
              {evaluation.weaknesses.map((item) => (
                <li key={item.title} className="flex gap-2">
                  <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-700">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FeedbackCard>

        <FeedbackCard
          group="improvement"
          title="Suggested improvements"
          count={evaluation.suggestedImprovements.length}
          icon={<Sparkles className="h-5 w-5 text-brand-600" />}
        >
          <ul className="space-y-3">
            {evaluation.suggestedImprovements.map((item) => (
              <li key={item.title} className="flex gap-2">
                <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-sm text-slate-700">{item.description}</p>
                  <p className="mt-1 flex items-start gap-1.5 rounded-md bg-brand-50 px-2 py-1.5 text-sm text-brand-900">
                    <ArrowRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {item.actionableStep}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </FeedbackCard>
      </div>
    </div>
  );
}
