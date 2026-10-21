import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Target } from 'lucide-react';
import type { ParsedResume, SkillGapAnalysisRecord } from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState } from '../components/ui/States';
import { Button, LinkButton } from '../components/ui/Button';
import { ProgressStages } from '../components/ui/Spinner';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { TagInput } from '../components/ui/TagInput';
import { SkillGapReportView } from '../components/feature/SkillGapReportView';
import { useAsyncAction, useAsyncQuery } from '../hooks/useAsync';
import { profileApi, resumeApi, skillGapApi } from '../services/endpoints';
import { useToast } from '../context/ToastContext';
import { errorMessage, shouldToast } from '../utils/errorMessage';

const ANALYSIS_STAGES = [
  'Checking your resume and profile',
  'Comparing your skills against the target role',
  'Writing your recommendations',
];

interface SetupData {
  targetRole: string;
  skills: string[];
  resumes: Array<{ id: string; label: string; parsed: ParsedResume | null }>;
  jobDescription: string;
  hasProfile: boolean;
}

export function SkillGapPage() {
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAnalysisId = searchParams.get('analysis');

  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [report, setReport] = useState<SkillGapAnalysisRecord | null>(null);
  const [initialised, setInitialised] = useState(false);

  const setup = useAsyncQuery<SetupData>(async () => {
    const [profileResult, resumeResult] = await Promise.all([profileApi.get(), resumeApi.list()]);
    const profile = profileResult.data.profile;
    const summaries = resumeResult.data.resumes.filter(
      (resume) => resume.processingStatus === 'COMPLETED',
    );

    // Fetch the newest resume's parsed skills so they can be corrected before analysing.
    const newest = summaries[0];
    const detail = newest ? await resumeApi.get(newest.id) : null;

    return {
      targetRole: profile?.targetRole ?? '',
      skills: [
        ...new Set([...(profile?.skills ?? []), ...(detail?.data.resume.parsedData.skills ?? [])]),
      ].slice(0, 50),
      resumes: summaries.map((resume) => ({
        id: resume.id,
        label: `${resume.originalFilename} (${new Date(resume.createdAt).toLocaleDateString()})`,
        parsed: resume.id === newest?.id ? (detail?.data.resume.parsedData ?? null) : null,
      })),
      jobDescription: profile?.jobDescription ?? '',
      hasProfile: profile !== null,
    };
  }, []);

  const history = useAsyncQuery(
    () => skillGapApi.history().then((result) => result.data.analyses),
    [],
  );

  // Seed the form from the profile once, without clobbering later edits.
  useEffect(() => {
    if (!setup.data || initialised) return;
    setTargetRole(setup.data.targetRole);
    setJobDescription(setup.data.jobDescription);
    setSkills(setup.data.skills);
    setResumeId(setup.data.resumes[0]?.id ?? '');
    setInitialised(true);
  }, [setup.data, initialised]);

  const load = useAsyncAction(
    async (analysisId: string) => {
      const result = await skillGapApi.get(analysisId);
      return result.data.analysis;
    },
    { onSuccess: (analysis) => setReport(analysis) },
  );

  // Deep link from the dashboard opens a specific report.
  useEffect(() => {
    if (requestedAnalysisId) void load.run(requestedAnalysisId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedAnalysisId]);

  const analyse = useAsyncAction(
    async () => {
      const result = await skillGapApi.analyze({
        resumeId: resumeId || null,
        targetRole,
        jobDescription,
        skills,
      });
      return result.data.analysis;
    },
    {
      onError: (error) => {
        if (shouldToast(error)) notify(errorMessage(error), 'error');
      },
      onSuccess: (analysis) => {
        setReport(analysis);
        setSearchParams({}, { replace: true });
        notify(
          analysis.generatedBy === 'AI_GENERATED'
            ? 'Your skill gap report is ready.'
            : 'AI analysis was unavailable, so this is a baseline checklist report.',
          analysis.generatedBy === 'AI_GENERATED' ? 'success' : 'info',
        );
        void history.reload();
      },
    },
  );

  const canAnalyse = targetRole.trim().length >= 2 && (skills.length > 0 || resumeId !== '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Skill gap analysis</h1>
        <p className="mt-1 text-sm text-slate-600">
          Compare what your resume and profile show against what a role actually needs.
        </p>
      </div>

      {setup.loading ? (
        <SkeletonCard lines={5} />
      ) : setup.error ? (
        <ErrorState error={setup.error} onRetry={() => void setup.reload()} />
      ) : !setup.data?.hasProfile ? (
        <Card>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="Complete your profile first"
            description="The analysis needs your experience level and target role to mean anything."
            action={<LinkButton to="/profile" size="sm">Go to my profile</LinkButton>}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="What to analyse"
            description="Correct your skills here before running it - these are treated as confirmed."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Target job role"
                name="targetRole"
                required
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                placeholder="e.g. Backend Engineer"
              />
              <SelectField
                label="Resume to use"
                name="resumeId"
                value={resumeId}
                onChange={(event) => setResumeId(event.target.value)}
                placeholder={
                  setup.data.resumes.length === 0 ? 'No parsed resume available' : 'None - profile only'
                }
                options={setup.data.resumes.map((resume) => ({
                  value: resume.id,
                  label: resume.label,
                }))}
                hint={
                  setup.data.resumes.length === 0
                    ? 'Upload a resume for a much more specific report.'
                    : undefined
                }
              />
            </div>

            <TagInput
              label="Skills to evaluate"
              value={skills}
              onChange={setSkills}
              hint="Remove anything inaccurate. An empty list falls back to your profile skills."
            />

            <TextAreaField
              label="Target job description"
              name="jobDescription"
              rows={5}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              hint="Optional. Pasting the real posting makes the gaps far more accurate."
            />

            {analyse.loading ? (
              <ProgressStages
                stages={ANALYSIS_STAGES}
                activeIndex={1}
                message="Analysing your skills against the target role..."
              />
            ) : null}

            {analyse.error ? (
              <ErrorState
                error={analyse.error}
                title="The analysis did not complete"
                onRetry={() => void analyse.run()}
                retrying={analyse.loading}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void analyse.run()}
                loading={analyse.loading}
                loadingLabel="Analyzing Skills..."
                disabled={!canAnalyse}
                icon={<Target className="h-4 w-4" />}
              >
                {report ? 'Regenerate analysis' : 'Run analysis'}
              </Button>
              {!canAnalyse ? (
                <span className="text-xs text-slate-500">
                  Add a target role and at least one skill, or pick a parsed resume.
                </span>
              ) : null}
            </div>
          </CardBody>
        </Card>
      )}

      {load.loading ? <SkeletonCard lines={6} /> : null}
      {load.error ? <ErrorState error={load.error} /> : null}

      {report ? (
        <SkillGapReportView
          report={report.report}
          generatedBy={report.generatedBy}
          createdAt={report.createdAt}
        />
      ) : !analyse.loading && !load.loading ? (
        <Card>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="No report open"
            description="Run an analysis above, or open one of your previous reports."
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Previous reports" />
        {history.loading ? (
          <CardBody>
            <SkeletonCard lines={2} className="border-0 shadow-none" />
          </CardBody>
        ) : history.error ? (
          <CardBody>
            <ErrorState error={history.error} onRetry={() => void history.reload()} />
          </CardBody>
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState title="Nothing yet" description="Your reports will be listed here." />
        ) : (
          <ul className="divide-y divide-slate-200">
            {(history.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.targetRole}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge tone={item.generatedBy === 'AI_GENERATED' ? 'brand' : 'warning'}>
                  {item.generatedBy === 'AI_GENERATED' ? 'AI' : 'Baseline'}
                </Badge>
                <span className="w-16 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {item.readinessScore}/100
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void load.run(item.id)}
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
