import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FileText, RefreshCw, Target, Trash2 } from 'lucide-react';
import type { ResumeDetail, ResumeFitRecord, ResumeSummary } from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState } from '../components/ui/States';
import { Button, LinkButton } from '../components/ui/Button';
import { ProgressStages } from '../components/ui/Spinner';
import { TextAreaField, TextField } from '../components/ui/Field';
import { ResumeDropzone } from '../components/feature/ResumeDropzone';
import { ParsedResumeEditor } from '../components/feature/ParsedResumeEditor';
import { ResumeFitReportView } from '../components/feature/ResumeFitReportView';
import { useAsyncAction, useAsyncQuery } from '../hooks/useAsync';
import { profileApi, resumeApi } from '../services/endpoints';
import { useToast } from '../context/ToastContext';
import { errorMessage, shouldToast } from '../utils/errorMessage';
import { cn } from '../utils/cn';

/** Mirrors MAX_RESUME_SIZE_MB. The server is the authority. */
const MAX_BYTES = 5 * 1024 * 1024;

const PARSE_STAGES = [
  'Uploading your file',
  'Extracting the text layer',
  'Identifying resume sections',
];

const REVIEW_STAGES = [
  'Measuring your resume',
  'Comparing it against the role',
  'Writing your improvements',
];

const STATUS_TONE = {
  COMPLETED: 'success',
  FAILED: 'danger',
  PROCESSING: 'brand',
  PENDING: 'neutral',
} as const;

export function ResumeAnalyzerPage() {
  const { notify } = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState<ResumeDetail | null>(null);
  const [fit, setFit] = useState<ResumeFitRecord | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showExtracted, setShowExtracted] = useState(false);
  const [seededRole, setSeededRole] = useState(false);

  const list = useAsyncQuery(() => resumeApi.list().then((result) => result.data.resumes), []);

  // Pre-fill the target role from the profile, without clobbering later edits.
  const profile = useAsyncQuery(
    () => profileApi.get().then((result) => result.data.profile),
    [],
  );
  useEffect(() => {
    if (!profile.data || seededRole) return;
    setTargetRole(profile.data.targetRole);
    setSeededRole(true);
  }, [profile.data, seededRole]);

  /** Opens a resume and loads any review already run for it. */
  const openResume = useCallback(async (resumeId: string) => {
    const [detail, existing] = await Promise.all([
      resumeApi.get(resumeId),
      resumeApi.latestFit(resumeId).catch(() => null),
    ]);
    setActive(detail.data.resume);
    setFit(existing?.data.fit ?? null);
    return detail.data.resume;
  }, []);

  const upload = useAsyncAction(
    async (file: File) => {
      setProgress(0);
      const result = await resumeApi.upload(file, setProgress);
      return result.data.resume;
    },
    {
      onSuccess: (resume) => {
        setProgress(null);
        setActive(resume);
        setFit(null);
        setShowExtracted(false);
        notify('Resume parsed. Now pick a target role to see how it matches.', 'success');
        void list.reload();
      },
      onError: (error) => {
        setProgress(null);
        if (shouldToast(error)) notify(errorMessage(error), 'error');
        void list.reload();
      },
    },
  );

  const open = useAsyncAction(openResume);

  const review = useAsyncAction(
    async () => {
      if (!active) throw new Error('No resume selected');
      const result = await resumeApi.analyzeFit(active.id, { targetRole, jobDescription });
      return result.data.fit;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: (result) => {
        setFit(result);
        notify(
          result.generatedBy === 'AI_GENERATED'
            ? 'Your resume review is ready.'
            : 'AI review was unavailable, so this shows the structural checks only.',
          result.generatedBy === 'AI_GENERATED' ? 'success' : 'info',
        );
      },
    },
  );

  const remove = useAsyncAction(
    async (resumeId: string) => {
      await resumeApi.remove(resumeId);
      return resumeId;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: (resumeId) => {
        if (active?.id === resumeId) {
          setActive(null);
          setFit(null);
        }
        notify('Resume and its stored file were deleted.', 'success');
        void list.reload();
      },
    },
  );

  const reparse = useAsyncAction(
    async () => {
      if (!active) throw new Error('No resume selected');
      const result = await resumeApi.reparse(active.id);
      return result.data.resume;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: (resume) => {
        setActive(resume);
        notify('Re-read your file. Run the review again to use the new reading.', 'success');
        void list.reload();
      },
    },
  );

  const saveCorrections = async (resumeId: string, parsedData: ResumeDetail['parsedData']) => {
    const result = await resumeApi.updateParsed(resumeId, parsedData);
    setActive(result.data.resume);
    notify('Corrections saved. Re-run the review to use them.', 'success');
    void list.reload();
  };

  const stageIndex = progress === null ? 0 : progress < 100 ? 0 : 1;
  const canReview = active !== null && targetRole.trim().length >= 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Resume analyzer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload your resume, tell us the role you are targeting, and see how well it matches -
          what works, what is missing, and exactly what to change.
        </p>
      </div>

      {/* Step 1 - the file */}
      <Card>
        <CardHeader
          title="1. Your resume"
          description={active ? `Using ${active.originalFilename}` : 'PDF or DOCX, one at a time.'}
        />
        <CardBody className="space-y-4">
          <ResumeDropzone
            maxBytes={MAX_BYTES}
            uploading={upload.loading}
            progress={progress}
            onSelect={(file) => void upload.run(file)}
            onReject={(message) => notify(message, 'error')}
          />

          {upload.loading ? (
            <ProgressStages
              stages={PARSE_STAGES}
              activeIndex={stageIndex}
              message="This usually takes a few seconds."
            />
          ) : null}

          {upload.error ? (
            <ErrorState
              error={upload.error}
              title="We could not process that file"
              onRetry={upload.reset}
            />
          ) : null}
        </CardBody>
      </Card>

      {/* Step 2 - the role */}
      <Card className={cn(!active && 'opacity-60')}>
        <CardHeader
          title="2. The role you are targeting"
          description="The review is written against this role, so be specific."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Target job role"
              name="fitTargetRole"
              required
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="e.g. Python Developer"
              disabled={!active}
              hint={active ? undefined : 'Upload a resume first.'}
            />
          </div>

          <TextAreaField
            label="Job description"
            name="fitJobDescription"
            rows={5}
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            disabled={!active}
            hint="Optional, but pasting the real posting makes the review far more specific."
          />

          {review.loading ? (
            <ProgressStages
              stages={REVIEW_STAGES}
              activeIndex={1}
              message="Checking your resume against the role..."
            />
          ) : null}

          {review.error ? (
            <ErrorState
              error={review.error}
              title="The review did not complete"
              onRetry={() => void review.run()}
              retrying={review.loading}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void review.run()}
              loading={review.loading}
              loadingLabel="Checking your resume..."
              disabled={!canReview}
              icon={<Target className="h-4 w-4" />}
              size="lg"
            >
              {fit ? 'Re-check my resume' : 'Check my resume for this role'}
            </Button>
            {!active ? (
              <span className="text-xs text-slate-500">Upload a resume to continue.</span>
            ) : !canReview ? (
              <span className="text-xs text-slate-500">Enter the role you are targeting.</span>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* Step 3 - the result */}
      {fit ? (
        <ResumeFitReportView fit={fit} />
      ) : active && !review.loading ? (
        <Card>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="No review yet"
            description="Enter your target role above and run the check to see how your resume measures up."
          />
        </Card>
      ) : null}

      {/* Secondary - what we read out of the file */}
      {active ? (
        <Card>
          <button
            type="button"
            onClick={() => setShowExtracted((value) => !value)}
            aria-expanded={showExtracted}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
          >
            <span>
              <span className="block text-base font-semibold text-slate-900">
                What we read from your file
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {active.textLength.toLocaleString()} characters. Correct anything we got wrong, then
                re-run the review.
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-5 w-5 shrink-0 text-slate-400 transition-transform',
                showExtracted && 'rotate-180',
              )}
            />
          </button>
          {showExtracted ? (
            <CardBody className="space-y-4 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <p className="min-w-0 flex-1 text-xs text-slate-600">
                  Reading a PDF is guesswork, and our parser improves over time. Re-reading the
                  file replaces everything below, including any corrections you have made.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void reparse.run()}
                  loading={reparse.loading}
                  loadingLabel="Re-reading..."
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  Re-read file
                </Button>
              </div>

              {reparse.error ? <ErrorState error={reparse.error} /> : null}

              <ParsedResumeEditor
                key={`${active.id}-${active.updatedAt}`}
                value={active.parsedData}
                onSave={(next) => saveCorrections(active.id, next)}
              />
            </CardBody>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Your resumes"
          description="Deleting a resume removes the stored file and its reviews."
          action={
            <LinkButton to="/skill-gap" variant="secondary" size="sm">
              Skill gap analysis
            </LinkButton>
          }
        />
        {list.loading ? (
          <CardBody>
            <SkeletonCard lines={3} className="border-0 shadow-none" />
          </CardBody>
        ) : list.error ? (
          <CardBody>
            <ErrorState error={list.error} onRetry={() => void list.reload()} />
          </CardBody>
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No resumes yet"
            description="Upload one above to get started."
          />
        ) : (
          <ul className="divide-y divide-slate-200">
            {(list.data as ResumeSummary[]).map((resume) => (
              <li
                key={resume.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-5 py-3',
                  active?.id === resume.id && 'bg-brand-50/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {resume.originalFilename}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(resume.createdAt).toLocaleString()} ·{' '}
                    {(resume.fileSize / 1024).toFixed(0)} KB
                  </p>
                  {resume.processingError ? (
                    <p className="mt-0.5 text-xs text-red-700">{resume.processingError}</p>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[resume.processingStatus]}>
                  {resume.processingStatus === 'COMPLETED' ? 'Parsed' : resume.processingStatus}
                </Badge>
                {resume.processingStatus === 'COMPLETED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={open.loading}
                    loadingLabel="Opening..."
                    onClick={() => void open.run(resume.id)}
                  >
                    {active?.id === resume.id ? 'Reload' : 'Use this'}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove.run(resume.id)}
                  loading={remove.loading}
                  loadingLabel="Deleting..."
                  icon={<Trash2 className="h-4 w-4 text-red-600" />}
                  aria-label={`Delete ${resume.originalFilename}`}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
