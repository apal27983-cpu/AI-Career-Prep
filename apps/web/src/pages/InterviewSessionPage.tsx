import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCheck, Flag, Lightbulb, Send } from 'lucide-react';
import {
  DIFFICULTY_LABELS,
  INTERVIEW_MODE_LABELS,
  LIMITS,
  type InterviewAnswerRecord,
  type InterviewSessionDetail,
  type PublicInterviewQuestion,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, ErrorState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { FullPageLoader, InlineSpinner, ProgressStages } from '../components/ui/Spinner';
import { TextAreaField } from '../components/ui/Field';
import { FeedbackPanel } from '../components/feature/FeedbackPanel';
import { useAsyncAction, useAsyncQuery } from '../hooks/useAsync';
import { interviewApi } from '../services/endpoints';
import { useToast } from '../context/ToastContext';
import { errorMessage, shouldToast } from '../utils/errorMessage';
import { cn } from '../utils/cn';

const EVALUATION_STAGES = [
  'Checking your answer',
  'Comparing it against the expected points',
  'Writing your feedback',
];

function makeIdempotencyKey(questionId: string): string {
  // Stable per question per attempt, so a retry after a timeout cannot create a
  // second evaluation for the same submission.
  return `${questionId}-${Date.now().toString(36)}`;
}

export function InterviewSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [session, setSession] = useState<InterviewSessionDetail | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<InterviewAnswerRecord | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const query = useAsyncQuery(
    async () => {
      const result = await interviewApi.get(sessionId);
      setSession(result.data.session);
      return result.data.session;
    },
    [sessionId],
  );

  const current: PublicInterviewQuestion | null = useMemo(() => {
    if (!session) return null;
    return session.questions.find((question) => !question.answered) ?? null;
  }, [session]);

  const answeredCount = session?.completedQuestions ?? 0;
  const total = session?.totalQuestions ?? 0;
  const allAnswered = session !== null && answeredCount >= total;

  const resetForNext = useCallback(() => {
    setAnswerText('');
    setSelectedOption(null);
    setFeedback(null);
    setShowHint(false);
    setIdempotencyKey(null);
  }, []);

  const submit = useAsyncAction(
    async () => {
      if (!current) throw new Error('No question is open');
      const key = idempotencyKey ?? makeIdempotencyKey(current.id);
      setIdempotencyKey(key);

      const result = await interviewApi.submitAnswer(sessionId, {
        questionId: current.id,
        answerText:
          current.answerFormat === 'MULTIPLE_CHOICE' && selectedOption !== null
            ? (current.options?.[selectedOption] ?? answerText)
            : answerText,
        selectedOptionIndex: selectedOption,
        idempotencyKey: key,
      });
      return result.data;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: async (result) => {
        setFeedback(result.answer);
        // Refresh so progress, averages and the answered flags are server truth.
        const refreshed = await interviewApi.get(sessionId);
        setSession(refreshed.data.session);
      },
    },
  );

  const next = useAsyncAction(
    async () => {
      const result = await interviewApi.nextQuestion(sessionId);
      const refreshed = await interviewApi.get(sessionId);
      setSession(refreshed.data.session);
      return result.data;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: () => resetForNext(),
    },
  );

  const finish = useAsyncAction(
    async () => {
      const result = await interviewApi.complete(sessionId);
      return result.data.session;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: (completed) => {
        notify('Interview complete. Here is your report.', 'success');
        navigate(`/history/${completed?.id ?? sessionId}`, { replace: true });
      },
    },
  );

  if (query.loading && !session) return <FullPageLoader message="Loading your interview..." />;

  if (query.error || !session) {
    return (
      <ErrorState
        error={query.error ?? new Error('Interview not found')}
        onRetry={() => void query.reload()}
      />
    );
  }

  if (session.status !== 'IN_PROGRESS') {
    return (
      <Card>
        <CardHeader
          title="This interview is finished"
          description="Open the report to review your answers and feedback."
        />
        <CardBody>
          <Button onClick={() => navigate(`/history/${session.id}`, { replace: true })}>
            View report
          </Button>
        </CardBody>
      </Card>
    );
  }

  const answerTooShort = current?.answerFormat === 'TEXT' && answerText.trim().length < 1;
  const noOptionChosen = current?.answerFormat === 'MULTIPLE_CHOICE' && selectedOption === null;
  const progressPercent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {INTERVIEW_MODE_LABELS[session.mode]}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {session.targetRole} · {DIFFICULTY_LABELS[session.difficulty]}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmExit(true)}
          icon={<Flag className="h-4 w-4" />}
        >
          Finish early
        </Button>
      </div>

      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">
              Question {Math.min(answeredCount + (feedback ? 0 : 1), total)} of {total}
            </span>
            <span className="tabular-nums text-slate-500">{answeredCount} answered</span>
          </div>
          <div
            role="progressbar"
            aria-label="Interview progress"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={total}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </CardBody>
      </Card>

      {confirmExit ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardBody className="space-y-3">
            <p className="text-sm font-medium text-slate-900">Finish this interview now?</p>
            <p className="text-sm text-slate-700">
              {answeredCount === 0
                ? 'You have not answered anything yet, so there will be no report.'
                : `Your report will cover the ${answeredCount} answer${answeredCount === 1 ? '' : 's'} you have given.`}
            </p>
            {finish.error ? <ErrorState error={finish.error} onRetry={() => void finish.run()} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void finish.run()}
                loading={finish.loading}
                loadingLabel="Generating Report..."
                icon={<CheckCheck className="h-4 w-4" />}
              >
                Finish and generate report
              </Button>
              <Button variant="secondary" onClick={() => setConfirmExit(false)}>
                Keep practising
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {current && !feedback ? (
        <Card>
          <CardHeader
            title={current.topic}
            action={
              <div className="flex items-center gap-2">
                <Badge>{DIFFICULTY_LABELS[current.difficulty]}</Badge>
                <Badge tone={current.source === 'AI_GENERATED' ? 'brand' : 'warning'}>
                  {current.source === 'AI_GENERATED' ? 'AI generated' : 'Curated question'}
                </Badge>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <p className="whitespace-pre-wrap text-base text-slate-900">{current.questionText}</p>

            {current.answerFormat === 'MULTIPLE_CHOICE' && current.options ? (
              <fieldset className="space-y-2">
                <legend className="sr-only">Choose an answer</legend>
                {current.options.map((option, index) => (
                  <label
                    key={index}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                      selectedOption === index
                        ? 'border-brand-600 bg-brand-50/60'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="answerOption"
                      value={index}
                      checked={selectedOption === index}
                      onChange={() => setSelectedOption(index)}
                      disabled={submit.loading}
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                    />
                    <span className="text-slate-900">
                      <span className="mr-1 font-semibold">{index + 1}.</span>
                      {option}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <TextAreaField
                label="Your answer"
                name="answerText"
                rows={9}
                maxLength={LIMITS.answerMax}
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                // Kept editable during submission so nothing is lost if it fails.
                hint={`${answerText.trim().split(/\s+/).filter(Boolean).length} words. Aim for the depth you would give in a real interview.`}
                placeholder="Answer as you would out loud in the interview."
              />
            )}

            {current.hint ? (
              <div>
                {showHint ? (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    {current.hint}
                  </p>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setShowHint(true)}>
                    Show a hint
                  </Button>
                )}
              </div>
            ) : null}

            {submit.loading ? (
              <ProgressStages
                stages={EVALUATION_STAGES}
                activeIndex={1}
                message="Evaluating your answer..."
              />
            ) : null}

            {submit.error ? (
              <ErrorState
                error={submit.error}
                title="Your answer was not submitted"
                onRetry={() => void submit.run()}
                retrying={submit.loading}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void submit.run()}
                loading={submit.loading}
                loadingLabel="Evaluating Answer..."
                disabled={answerTooShort || noOptionChosen}
                icon={<Send className="h-4 w-4" />}
              >
                Submit answer
              </Button>
              {answerTooShort ? (
                <span className="text-xs text-slate-500">Write an answer before submitting.</span>
              ) : null}
              {noOptionChosen ? (
                <span className="text-xs text-slate-500">Choose one of the options.</span>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {feedback ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Your answer" />
            <CardBody>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{feedback.answerText}</p>
            </CardBody>
          </Card>

          <FeedbackPanel evaluation={feedback.evaluation} />

          {next.error ? (
            <ErrorState
              error={next.error}
              title="We could not prepare the next question"
              onRetry={() => void next.run()}
              retrying={next.loading}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {allAnswered ? (
              <Button
                onClick={() => void finish.run()}
                loading={finish.loading}
                loadingLabel="Generating Report..."
                icon={<CheckCheck className="h-4 w-4" />}
              >
                Finish and generate report
              </Button>
            ) : (
              <Button
                onClick={() => void next.run()}
                loading={next.loading}
                loadingLabel="Preparing your interview question..."
                icon={<ArrowRight className="h-4 w-4" />}
              >
                Next question
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirmExit(true)}>
              Finish early
            </Button>
            {next.loading ? <InlineSpinner label="Preparing your next question" /> : null}
          </div>
        </div>
      ) : null}

      {!current && !feedback && !allAnswered ? (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-700">
              Ready for the next question in this session.
            </p>
            <Button
              onClick={() => void next.run()}
              loading={next.loading}
              loadingLabel="Preparing your interview question..."
            >
              Get next question
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {!current && allAnswered && !feedback ? (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-700">
              You have answered all {total} questions. Generate your report to see the summary.
            </p>
            <Button
              onClick={() => void finish.run()}
              loading={finish.loading}
              loadingLabel="Generating Report..."
              icon={<CheckCheck className="h-4 w-4" />}
            >
              Generate report
            </Button>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
