import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Calculator, Code2, Play, Users } from 'lucide-react';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  INTERVIEW_MODES,
  INTERVIEW_MODE_DESCRIPTIONS,
  INTERVIEW_MODE_LABELS,
  QUESTION_COUNT_OPTIONS,
  type Difficulty,
  type ExperienceLevel,
  type InterviewMode,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { ErrorState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { ProgressStages } from '../components/ui/Spinner';
import { SelectField, TextField } from '../components/ui/Field';
import { useAsyncAction, useAsyncQuery } from '../hooks/useAsync';
import { interviewApi, profileApi } from '../services/endpoints';
import { useToast } from '../context/ToastContext';
import { cn } from '../utils/cn';

const MODE_ICONS: Record<InterviewMode, typeof Code2> = {
  TECHNICAL: Code2,
  NON_TECHNICAL: Users,
  APTITUDE: Calculator,
  HR: Brain,
};

const START_STAGES = [
  'Creating your session',
  'Preparing your first questions',
  'Getting the interview ready',
];

export function InterviewPracticePage() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [mode, setMode] = useState<InterviewMode>('TECHNICAL');
  const [targetRole, setTargetRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('ENTRY_LEVEL');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [totalQuestions, setTotalQuestions] = useState<number>(5);
  const [seeded, setSeeded] = useState(false);

  const profile = useAsyncQuery(
    () => profileApi.get().then((result) => result.data.profile),
    [],
  );

  useEffect(() => {
    if (!profile.data || seeded) return;
    setTargetRole(profile.data.targetRole);
    setExperienceLevel(profile.data.experienceLevel);
    setMode(profile.data.preferredInterviewMode);
    setSeeded(true);
  }, [profile.data, seeded]);

  const start = useAsyncAction(
    async () => {
      const result = await interviewApi.create({
        mode,
        targetRole,
        experienceLevel,
        difficulty,
        totalQuestions,
      });
      return result.data.session;
    },
    {
      onSuccess: (session) => {
        notify('Interview ready. Good luck.', 'success');
        navigate(`/interview/${session.id}`);
      },
    },
  );

  const canStart = targetRole.trim().length >= 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Interview practice</h1>
        <p className="mt-1 text-sm text-slate-600">
          Four modes, each with its own questions and marking criteria. Every answer comes back with
          strengths, weaknesses and specific improvements.
        </p>
      </div>

      <fieldset>
        <legend className="mb-3 text-sm font-medium text-slate-800">Choose a mode</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTERVIEW_MODES.map((option) => {
            const Icon = MODE_ICONS[option];
            const selected = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={selected}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {INTERVIEW_MODE_LABELS[option]}
                  </span>
                </span>
                <span className="mt-2 block text-sm text-slate-600">
                  {INTERVIEW_MODE_DESCRIPTIONS[option]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Card>
        <CardHeader title="Session settings" />
        <CardBody className="space-y-4">
          {profile.loading ? (
            <SkeletonCard lines={3} className="border-0 shadow-none" />
          ) : profile.error ? (
            <ErrorState error={profile.error} onRetry={() => void profile.reload()} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Target role"
                  name="interviewTargetRole"
                  required
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                  placeholder="e.g. Backend Engineer"
                />
                <SelectField
                  label="Experience level"
                  name="interviewExperienceLevel"
                  value={experienceLevel}
                  onChange={(event) => setExperienceLevel(event.target.value as ExperienceLevel)}
                  options={EXPERIENCE_LEVELS.map((level) => ({
                    value: level,
                    label: EXPERIENCE_LEVEL_LABELS[level],
                  }))}
                />
                <SelectField
                  label="Difficulty"
                  name="interviewDifficulty"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                  options={DIFFICULTIES.map((level) => ({
                    value: level,
                    label: DIFFICULTY_LABELS[level],
                  }))}
                />
                <SelectField
                  label="Number of questions"
                  name="interviewQuestionCount"
                  value={String(totalQuestions)}
                  onChange={(event) => setTotalQuestions(Number(event.target.value))}
                  options={QUESTION_COUNT_OPTIONS.map((count) => ({
                    value: String(count),
                    label: `${count} questions`,
                  }))}
                  hint="Questions are prepared in small batches as you go, to keep costs down."
                />
              </div>

              {start.loading ? (
                <ProgressStages
                  stages={START_STAGES}
                  activeIndex={1}
                  message="Preparing your interview question..."
                />
              ) : null}

              {start.error ? (
                <ErrorState
                  error={start.error}
                  title="We could not start that interview"
                  onRetry={() => void start.run()}
                  retrying={start.loading}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void start.run()}
                  loading={start.loading}
                  loadingLabel="Preparing interview..."
                  disabled={!canStart}
                  icon={<Play className="h-4 w-4" />}
                  size="lg"
                >
                  Start {INTERVIEW_MODE_LABELS[mode].toLowerCase()}
                </Button>
                {!canStart ? (
                  <span className="text-xs text-slate-500">Enter a target role to start.</span>
                ) : null}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
