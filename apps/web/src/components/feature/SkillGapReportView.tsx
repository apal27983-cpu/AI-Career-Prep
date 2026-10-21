import { CheckCircle2, CircleHelp, Lightbulb, ListChecks, Route, TriangleAlert } from 'lucide-react';
import {
  AI_ESTIMATE_DISCLAIMER,
  GAP_LEVELS,
  SKILL_EVIDENCE_LABELS,
  type SkillGapItem,
  type SkillGapReport,
} from '@career-prep/shared';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Badge, ScoreBar, type BadgeTone } from '../ui/States';
import { SkillRadarChart } from './charts';

const GAP_TONE: Record<(typeof GAP_LEVELS)[number], BadgeTone> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

function SkillRow({ item }: { item: SkillGapItem }) {
  return (
    <li className="space-y-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{item.skill}</p>
        <Badge>{item.category}</Badge>
        <Badge tone={GAP_TONE[item.gapLevel]}>{item.gapLevel} gap</Badge>
        <span className="ml-auto text-xs tabular-nums text-slate-500">
          {item.currentProficiency === null ? 'not established' : `${item.currentProficiency}/5`}
          {' → '}
          needs {item.requiredProficiency}/5
        </span>
      </div>

      <p className="text-xs font-medium text-slate-500">
        {SKILL_EVIDENCE_LABELS[item.evidenceStatus]}
      </p>
      {item.evidence ? (
        <p className="border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">
          {item.evidence}
        </p>
      ) : null}
      <p className="text-sm text-slate-700">{item.explanation}</p>
      <p className="text-sm text-slate-900">
        <span className="font-medium">Do this: </span>
        {item.recommendedAction}
      </p>
    </li>
  );
}

export function SkillGapReportView({
  report,
  generatedBy,
  createdAt,
}: {
  report: SkillGapReport;
  generatedBy: 'AI_GENERATED' | 'CURATED_FALLBACK';
  createdAt: string;
}) {
  const highPriority = [...report.existingSkills, ...report.missingSkills].filter(
    (item) => item.gapLevel === 'HIGH',
  );

  const radarData = [...report.missingSkills, ...report.existingSkills]
    .slice(0, 8)
    .map((item) => ({
      skill: item.skill,
      current: item.currentProficiency,
      required: item.requiredProficiency,
    }));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Readiness for ${report.targetRole}`}
          description={`Generated ${new Date(createdAt).toLocaleString()}`}
          action={
            <Badge tone={generatedBy === 'AI_GENERATED' ? 'brand' : 'warning'}>
              {generatedBy === 'AI_GENERATED' ? 'AI analysis' : 'Baseline checklist'}
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          <ScoreBar label="Overall readiness estimate" value={report.readinessScore} tone="brand" />
          <p className="text-sm text-slate-700">{report.readinessRationale}</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {AI_ESTIMATE_DISCLAIMER} It is not a prediction of whether you will be hired.
          </p>
        </CardBody>
      </Card>

      {radarData.length >= 3 ? (
        <Card>
          <CardBody>
            <SkillRadarChart data={radarData} />
          </CardBody>
        </Card>
      ) : null}

      {highPriority.length > 0 ? (
        <Card>
          <CardHeader
            title="Highest priority"
            description="The gaps most likely to come up in interviews for this role."
          />
          <CardBody>
            <ul className="space-y-2">
              {highPriority.slice(0, 6).map((item) => (
                <li key={`${item.skill}-priority`} className="flex items-start gap-2 text-sm">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                  />
                  <span>
                    <span className="font-medium text-slate-900">{item.skill}</span>{' '}
                    <span className="text-slate-600">- {item.recommendedAction}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Skills with support in your resume"
            description={`${report.existingSkills.length} found`}
          />
          {report.existingSkills.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-600">
                Nothing could be confirmed from your resume or profile. Add skills on your profile,
                or upload a resume that shows where you used them.
              </p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-200">
              {report.existingSkills.map((item) => (
                <SkillRow key={`${item.skill}-existing`} item={item} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Gaps for this role"
            description={`${report.missingSkills.length} to work on`}
          />
          {report.missingSkills.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-600">No gaps were identified for this role.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-200">
              {report.missingSkills.map((item) => (
                <SkillRow key={`${item.skill}-missing`} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {report.learningRoadmap.length > 0 ? (
        <Card>
          <CardHeader title="Your learning roadmap" description="In the order we suggest." />
          <CardBody>
            <ol className="space-y-4">
              {report.learningRoadmap.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-0.5 text-sm text-slate-700">{step.description}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {step.estimatedEffort ? <span>{step.estimatedEffort}</span> : null}
                      {step.skills.map((skill) => (
                        <Badge key={skill}>{skill}</Badge>
                      ))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {report.suggestedProjects.length > 0 ? (
          <Card>
            <CardHeader title="Projects to build" />
            <CardBody>
              <ul className="space-y-4">
                {report.suggestedProjects.map((project) => (
                  <li key={project.title} className="flex gap-3">
                    <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{project.title}</p>
                      <p className="mt-0.5 text-sm text-slate-700">{project.description}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {project.skillsPractised.map((skill) => (
                          <Badge key={skill}>{skill}</Badge>
                        ))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <div className="space-y-5">
          {report.learningPriorities.length > 0 ? (
            <Card>
              <CardHeader title="Learning priorities" />
              <CardBody>
                <ul className="space-y-2">
                  {report.learningPriorities.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                      <ListChecks aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {report.suggestedInterviewTopics.length > 0 ? (
            <Card>
              <CardHeader title="Topics to expect in interviews" />
              <CardBody>
                <ul className="flex flex-wrap gap-1.5">
                  {report.suggestedInterviewTopics.map((topic) => (
                    <li key={topic}>
                      <Badge tone="brand">{topic}</Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {report.nextSteps.length > 0 ? (
            <Card>
              <CardHeader title="Next steps" />
              <CardBody>
                <ul className="space-y-2">
                  {report.nextSteps.map((step) => (
                    <li key={step} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {step}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {report.limitations.length > 0 ? (
        <Card>
          <CardHeader
            title="What this report could not establish"
            description="Shown because an absent skill is not proof you lack it."
          />
          <CardBody>
            <ul className="space-y-2">
              {report.limitations.map((limitation) => (
                <li key={limitation} className="flex items-start gap-2 text-sm text-slate-700">
                  <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {limitation}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Route aria-hidden="true" className="h-3.5 w-3.5" />
        Proficiency is a 1-5 estimate, where 3 means you can work with guidance and 5 means you
        could lead and mentor on it.
      </p>
    </div>
  );
}
