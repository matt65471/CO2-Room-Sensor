import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { METRICS, formatDisplayed, unitLabel, type Metric, type TempUnit } from '../../lib/metrics';
import {
  CO2_THRESHOLDS,
  GRID,
  MUTED,
  domainFor,
  formatWindowTick,
  tooltipStyle,
  type Band,
  type ChartPoint,
} from '../../charts/chartUtils';

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
    return <div className="chart-box chart-placeholder">Loading…</div>;
  }
  if (!points.some((p) => p[info.key] !== null)) {
    return <div className="chart-box chart-placeholder">No {info.label.toLowerCase()} readings in this window.</div>;
  }

  // The box's height scales with the window (styles/analysis.css), so every chart on the tab fits on one screen
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} syncId={syncId} syncMethod="value" margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
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
    </div>
  );
}
