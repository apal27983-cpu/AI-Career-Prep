import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  INTERVIEW_MODES,
  INTERVIEW_MODE_LABELS,
  LIMITS,
  profileInputSchema,
  type CandidateProfile,
  type ProfileInput,
} from '@career-prep/shared';
import { Button } from '../ui/Button';
import { SelectField, TextAreaField, TextField } from '../ui/Field';
import { TagInput } from '../ui/TagInput';
import { ErrorState } from '../ui/States';
import { applyServerFieldErrors } from '../../utils/formErrors';
import { useAsyncAction } from '../../hooks/useAsync';

const EXPERIENCE_OPTIONS = EXPERIENCE_LEVELS.map((level) => ({
  value: level,
  label: EXPERIENCE_LEVEL_LABELS[level],
}));

const MODE_OPTIONS = INTERVIEW_MODES.map((mode) => ({
  value: mode,
  label: INTERVIEW_MODE_LABELS[mode],
}));

function toFormValues(profile: CandidateProfile | null, fallbackName: string): ProfileInput {
  return {
    fullName: profile?.fullName ?? fallbackName,
    currentRole: profile?.currentRole ?? '',
    targetRole: profile?.targetRole ?? '',
    experienceLevel: profile?.experienceLevel ?? 'ENTRY_LEVEL',
    yearsOfExperience: profile?.yearsOfExperience ?? 0,
    education: profile?.education ?? '',
    skills: profile?.skills ?? [],
    learningGoals: profile?.learningGoals ?? [],
    preferredInterviewMode: profile?.preferredInterviewMode ?? 'TECHNICAL',
    targetIndustry: profile?.targetIndustry ?? '',
    careerObjective: profile?.careerObjective ?? '',
    jobDescription: profile?.jobDescription ?? '',
  };
}

export function ProfileForm({
  profile,
  fallbackName,
  onSaved,
  submitLabel = 'Save profile',
  loadingLabel = 'Saving profile...',
  save,
}: {
  profile: CandidateProfile | null;
  fallbackName: string;
  onSaved: (profile: CandidateProfile) => void;
  submitLabel?: string;
  loadingLabel?: string;
  save: (input: ProfileInput) => Promise<CandidateProfile>;
}) {
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileInputSchema),
    defaultValues: toFormValues(profile, fallbackName),
  });

  const submit = useAsyncAction(async (values: ProfileInput) => save(values), {
    onSuccess: (saved) => {
      // Re-seed the form from the server copy, so trimming and de-duplication show.
      form.reset(toFormValues(saved, fallbackName));
      onSaved(saved);
    },
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const errors = form.formState.errors;

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={form.handleSubmit((values) => void submit.run(values))}
    >
      {submit.error ? <ErrorState error={submit.error} onRetry={submit.reset} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          required
          autoComplete="name"
          error={errors.fullName?.message}
          {...form.register('fullName')}
        />
        <TextField
          label="Current role or student status"
          required
          placeholder="e.g. Final year CS student"
          error={errors.currentRole?.message}
          {...form.register('currentRole')}
        />
        <TextField
          label="Target job role"
          required
          placeholder="e.g. Backend Engineer"
          hint="Used for skill gap analysis and interview questions."
          error={errors.targetRole?.message}
          {...form.register('targetRole')}
        />
        <TextField
          label="Target industry"
          placeholder="e.g. Fintech"
          error={errors.targetIndustry?.message}
          {...form.register('targetIndustry')}
        />
        <SelectField
          label="Experience level"
          required
          options={EXPERIENCE_OPTIONS}
          error={errors.experienceLevel?.message}
          {...form.register('experienceLevel')}
        />
        <TextField
          label="Years of experience"
          type="number"
          min={0}
          max={60}
          step={1}
          required
          error={errors.yearsOfExperience?.message}
          {...form.register('yearsOfExperience', { valueAsNumber: true })}
        />
        <TextField
          label="Highest education"
          required
          placeholder="e.g. BSc Computer Science, 2024"
          error={errors.education?.message}
          className="sm:col-span-1"
          {...form.register('education')}
        />
        <SelectField
          label="Preferred interview mode"
          required
          options={MODE_OPTIONS}
          error={errors.preferredInterviewMode?.message}
          {...form.register('preferredInterviewMode')}
        />
      </div>

      <Controller
        control={form.control}
        name="skills"
        render={({ field, fieldState }) => (
          <TagInput
            label="Primary skills"
            value={field.value ?? []}
            onChange={field.onChange}
            hint={`Add up to ${LIMITS.maxSkills}. These are treated as confirmed, so keep them accurate.`}
            error={fieldState.error?.message}
            placeholder="e.g. TypeScript"
          />
        )}
      />

      <Controller
        control={form.control}
        name="learningGoals"
        render={({ field, fieldState }) => (
          <TagInput
            label="Skills you want to learn"
            value={field.value ?? []}
            onChange={field.onChange}
            hint="Optional. Used to prioritise your learning roadmap."
            error={fieldState.error?.message}
            placeholder="e.g. Kubernetes"
          />
        )}
      />

      <TextAreaField
        label="Career objective"
        rows={3}
        placeholder="What are you aiming for over the next year or two?"
        hint="Optional."
        error={errors.careerObjective?.message}
        {...form.register('careerObjective')}
      />

      <TextAreaField
        label="Target job description"
        rows={6}
        placeholder="Paste a job description you are targeting."
        hint="Optional, but it makes the skill gap analysis noticeably sharper."
        error={errors.jobDescription?.message}
        {...form.register('jobDescription')}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={submit.loading} loadingLabel={loadingLabel}>
          {submitLabel}
        </Button>
        {form.formState.isDirty && !submit.loading ? (
          <span className="text-xs text-slate-500">You have unsaved changes.</span>
        ) : null}
      </div>
    </form>
  );
}
