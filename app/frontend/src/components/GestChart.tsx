import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RoomModel } from '../api';
import { GRID, MUTED, tooltipStyle } from './chartUtils';
import { formatWindowTick } from './MetricChart';

export const GEST_COLOR = '#d6409f';

type GestPoint = { time: number; g: number | null };

// Blank point wherever estimates stop for a while, so the line shows a gap
function withGaps(model: RoomModel): GestPoint[] {
  const out: GestPoint[] = [];
  const maxGapMs = model.gest.bucketSecs * 1000 * 3;
  let prev: number | null = null;
  for (const p of model.gest.points) {
    const time = Date.parse(p.t);
    if (prev !== null && time - prev > maxGapMs) out.push({ time: prev + 1, g: null });
    out.push({ time, g: p.g });
    prev = time;
  }
  return out;
}

// Round the axis out to the next 200 ppm/h, always including 0
const domain: [(v: number) => number, (v: number) => number] = [
  (v) => (Number.isFinite(v) ? Math.min(0, Math.floor(v / 200) * 200) : 0),
  (v) => (Number.isFinite(v) ? Math.max(200, Math.ceil(v / 200) * 200) : 800),
];

interface Props {
  model: RoomModel | null;
  start: number;
  end: number;
  syncId?: string;
}

// G_est over time: how fast the people in the room are pushing CO2 up. ≈ 0 means the room is empty.
export default function GestChart({ model, start, end, syncId }: Props) {
  if (!model) {
    return <div className="chart-box chart-placeholder">Loading…</div>;
  }
  if (model.lambdaPerHour === null) {
    return (
      <div className="chart-box chart-placeholder">
        Needs the room's air-change rate λ, which needs at least one empty-room decay in the past week.
      </div>
    );
  }
  const points = withGaps(model);
  if (!points.some((p) => p.g !== null)) {
    return <div className="chart-box chart-placeholder">No CO₂ readings in this window.</div>;
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} syncId={syncId} syncMethod="value" margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
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
          <YAxis domain={domain} tick={{ fill: GEST_COLOR, fontSize: 11 }} stroke={GRID} width={48} allowDecimals={false} />
          <ReferenceLine y={0} stroke={MUTED} />
          <Tooltip
            labelFormatter={(t) => new Date(t as number).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            formatter={(value) => [value === null ? '—' : `${Math.round(Number(value))} ppm/h`, 'G_est']}
            contentStyle={tooltipStyle}
          />
          <Line
            type="monotone"
            dataKey="g"
            stroke={GEST_COLOR}
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
