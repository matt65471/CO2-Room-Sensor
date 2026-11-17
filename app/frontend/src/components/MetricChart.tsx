import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { METRICS, formatDisplayed, unitLabel, type Metric, type TempUnit } from '../metrics';
import { CO2_THRESHOLDS, GRID, MUTED, domainFor, tooltipStyle, type ChartPoint } from './chartUtils';

// Compact, so all three charts and tables fit on one full-screen view
export const METRIC_CHART_HEIGHT = 150;

// A shaded stretch of time, e.g. a CO2 decay
export interface Band {
  x1: number;
  x2: number;
  color: string;
}

// Tick labels get coarser as the window gets longer
export function formatWindowTick(time: number, spanMs: number): string {
  const d = new Date(time);
  const day = 24 * 3600 * 1000;
  if (spanMs <= day) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (spanMs <= 7 * day) return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  metric: Metric;
  points: ChartPoint[] | null;
  start: number;
  end: number;
  tempUnit: TempUnit;
  syncId?: string;
  bands?: Band[];
}

// One measurement on its own chart. Charts sharing a syncId show their tooltips together.
export default function MetricChart({ metric, points, start, end, tempUnit, syncId, bands = [] }: Props) {
  const info = METRICS[metric];

  if (!points) {
    return <div className="chart-placeholder compact">Loading…</div>;
  }
  if (!points.some((p) => p[info.key] !== null)) {
    return <div className="chart-placeholder compact">No {info.label.toLowerCase()} readings in this window.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={METRIC_CHART_HEIGHT}>
      <LineChart data={points} syncId={syncId} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {bands
          .filter((b) => b.x2 > start && b.x1 < end)
          .map((b) => (
            <ReferenceArea
              key={b.x1}
              x1={Math.max(b.x1, start)}
              x2={Math.min(b.x2, end)}
              fill={b.color}
              fillOpacity={0.14}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, end]}
          tickFormatter={(t: number) => formatWindowTick(t, end - start)}
          tick={{ fill: MUTED, fontSize: 11 }}
          stroke={GRID}
          minTickGap={40}
        />
        <YAxis
          domain={domainFor(metric, tempUnit)}
          tick={{ fill: info.color, fontSize: 11 }}
          tickFormatter={(v: number) => `${v}${metric === 'co2' ? '' : unitLabel(metric, tempUnit)}`}
          stroke={GRID}
          width={48}
          allowDecimals={false}
        />
        {metric === 'co2' &&
          CO2_THRESHOLDS.map((t) => (
            <ReferenceLine key={t.ppm} y={t.ppm} stroke={t.color} strokeDasharray="4 4" ifOverflow="hidden" />
          ))}
        <Tooltip
          labelFormatter={(t) => new Date(t as number).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          formatter={(value) => [formatDisplayed(metric, value === null ? null : Number(value), tempUnit), info.label]}
          contentStyle={tooltipStyle}
        />
        <Line
          type="monotone"
          dataKey={info.key}
          stroke={info.color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
