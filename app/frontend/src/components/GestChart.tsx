import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RoomModel } from '../api';
import { GRID, MUTED, tooltipStyle } from './chartUtils';
import { formatWindowTick } from './MetricChart';
import { EVENTS, OCCUPANCY } from './RoomModel';

// Event lines get a text label only when there's room for it: on windows up to 3 days, and only
// if the previous labelled line is at least 6% of the chart's width away (the line itself always shows)
const LABEL_EVENTS_MAX_SPAN_MS = 3 * 24 * 3600 * 1000;
const MIN_LABEL_GAP_SHARE = 0.06;

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
  showLabels?: boolean; // shade empty / active / asleep and draw the events between them
}

// G_est over time: how fast the people in the room are pushing CO2 up. ≈ 0 means the room is empty.
export default function GestChart({ model, start, end, syncId, showLabels = false }: Props) {
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
  const segments = showLabels ? model.occupancy.segments.filter((s) => s.label !== 'unknown') : [];
  const events = showLabels ? model.occupancy.events : [];
  const labelled = new Set<string>();
  if (end - start <= LABEL_EVENTS_MAX_SPAN_MS) {
    let last = -Infinity;
    for (const e of events) {
      const t = Date.parse(e.t);
      if (t - last >= (end - start) * MIN_LABEL_GAP_SHARE) {
        labelled.add(e.t);
        last = t;
      }
    }
  }
  if (!points.some((p) => p.g !== null)) {
    return <div className="chart-box chart-placeholder">No CO₂ readings in this window.</div>;
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} syncId={syncId} syncMethod="value" margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          {segments.map((s) => (
            <ReferenceArea
              key={s.start}
              x1={Math.max(Date.parse(s.start), start)}
              x2={Math.min(Date.parse(s.end), end)}
              fill={OCCUPANCY[s.label].color}
              fillOpacity={0.16}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
          {events.map((e) => (
            <ReferenceLine
              key={e.t}
              x={Date.parse(e.t)}
              stroke={OCCUPANCY[EVENTS[e.type].to].color}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              ifOverflow="hidden"
              label={
                labelled.has(e.t)
                  ? {
                      value: EVENTS[e.type].label,
                      position: 'insideTopLeft',
                      fill: OCCUPANCY[EVENTS[e.type].to].color,
                      fontSize: 10,
                    }
                  : undefined
              }
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
