import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INTERVIEW_MODE_LABELS, type InterviewMode } from '@career-prep/shared';

/**
 * Chart tokens. Series colours come from a palette validated for colour-vision
 * deficiency separation and for contrast against a white surface, so they are
 * kept here rather than picked per chart.
 */
const VIZ = {
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e2e8f0',
  axisText: '#64748b',
  surface: '#ffffff',
} as const;

const AXIS_TICK = { fill: VIZ.axisText, fontSize: 12 } as const;

/** One tooltip style for every chart, so hover feels the same throughout. */
function VizTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-card-hover">
      {label !== undefined ? (
        <p className="mb-1 font-medium text-slate-900">{String(label)}</p>
      ) : null}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-slate-700">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">
              {entry.value}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartFrame({
  title,
  caption,
  height,
  children,
}: {
  title: string;
  caption?: string;
  height: number;
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as never}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Average score per interview mode. One series, so no legend is needed. */
export function ScoreByModeChart({
  data,
}: {
  data: Array<{ mode: InterviewMode; averageScore: number; sessions: number }>;
}) {
  const rows = data.map((row) => ({
    name: INTERVIEW_MODE_LABELS[row.mode].replace(' Interview', ''),
    score: row.averageScore,
    sessions: row.sessions,
  }));

  return (
    <ChartFrame
      title="Average score by interview mode"
      caption="Scores are AI estimates from your practice answers, out of 100."
      height={240}
    >
      <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: VIZ.grid }} />
        <YAxis
          domain={[0, 100]}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          content={<VizTooltip />}
          cursor={{ fill: 'rgba(42, 120, 214, 0.06)' }}
          formatter={(value: number) => [value, 'Average score'] as [number, string]}
        />
        <Bar dataKey="score" name="Average score" fill={VIZ.series1} radius={[4, 4, 0, 0]} maxBarSize={56}>
          {/* Direct labels: the values matter more than reading them off the axis. */}
          <LabelList dataKey="score" position="top" fill={VIZ.axisText} fontSize={11} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Current versus required proficiency. Two series, so a legend is always shown. */
export function SkillRadarChart({
  data,
}: {
  data: Array<{ skill: string; current: number | null; required: number }>;
}) {
  const rows = data.slice(0, 8).map((row) => ({
    skill: row.skill.length > 18 ? `${row.skill.slice(0, 17)}...` : row.skill,
    // A skill with no evidence is plotted at 0 and explained in the list below,
    // because a radar cannot show "unknown" as a gap in the shape.
    current: row.current ?? 0,
    required: row.required,
  }));

  return (
    <ChartFrame
      title="Proficiency versus what the role needs"
      caption="1-5 scale. Skills with no evidence in your resume are plotted at 0 - see the list below for which."
      height={300}
    >
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid stroke={VIZ.grid} />
        <PolarAngleAxis dataKey="skill" tick={{ fill: VIZ.axisText, fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fill: VIZ.axisText, fontSize: 10 }} />
        <Radar
          name="Your estimate"
          dataKey="current"
          stroke={VIZ.series1}
          strokeWidth={2}
          fill={VIZ.series1}
          fillOpacity={0.22}
        />
        <Radar
          name="Role needs"
          dataKey="required"
          stroke={VIZ.series2}
          strokeWidth={2}
          fill={VIZ.series2}
          fillOpacity={0.12}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: VIZ.axisText, paddingTop: 8 }}
          iconType="plainline"
        />
        <Tooltip content={<VizTooltip />} />
      </RadarChart>
    </ChartFrame>
  );
}

/** Score over time. One series, so the title carries the identity. */
export function ScoreTrendChart({ data }: { data: Array<{ label: string; score: number }> }) {
  return (
    <ChartFrame
      title="Interview score over time"
      caption="Average score per practice session, oldest first."
      height={220}
    >
      <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: VIZ.grid }} />
        <YAxis
          domain={[0, 100]}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        >
          <Label value="Score" angle={-90} position="insideLeft" style={{ fill: VIZ.axisText, fontSize: 11 }} />
        </YAxis>
        <Tooltip content={<VizTooltip />} />
        <Line
          type="monotone"
          dataKey="score"
          name="Average score"
          stroke={VIZ.series1}
          strokeWidth={2}
          dot={{ r: 4, fill: VIZ.series1, stroke: VIZ.surface, strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: VIZ.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ChartFrame>
  );
}
