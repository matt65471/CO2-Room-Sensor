import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Range, ReadingsResponse } from '../api';

const LINE_COLOR = '#2f7de1';
const MUTED = '#8a8f98';
const GRID = 'rgba(138, 143, 152, 0.25)';

interface ChartPoint {
  time: number;
  ppm: number | null;
}

// Insert a blank point wherever readings stop for a while (sensor offline), so the line
// shows a gap instead of a misleading straight line across the missing period.
function withGaps(data: ReadingsResponse): ChartPoint[] {
  const out: ChartPoint[] = [];
  const maxGapMs = data.bucketSecs * 1000 * 3;
  let prev: number | null = null;
  for (const p of data.points) {
    const time = new Date(p.t).getTime();
    if (prev !== null && time - prev > maxGapMs) {
      out.push({ time: prev + 1, ppm: null });
    }
    out.push({ time, ppm: p.ppm });
    prev = time;
  }
  return out;
}

function formatTick(time: number, range: Range): string {
  const d = new Date(time);
  if (range === '3d') {
    return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roundDown(v: number) {
  return Math.max(0, Math.floor((v - 50) / 100) * 100);
}

function roundUp(v: number) {
  return Math.ceil((v + 50) / 100) * 100;
}

interface Props {
  data: ReadingsResponse | null;
}

export default function Co2Chart({ data }: Props) {
  if (!data) {
    return <div className="chart-placeholder">Loading…</div>;
  }
  if (data.points.length === 0) {
    return <div className="chart-placeholder">No readings in this time range.</div>;
  }

  const points = withGaps(data);
  const start = new Date(data.since).getTime();
  const end = Date.now();

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[start, end]}
            tickFormatter={(t: number) => formatTick(t, data.range)}
            tick={{ fill: MUTED, fontSize: 12 }}
            stroke={GRID}
            minTickGap={40}
          />
          <YAxis
            domain={[roundDown, roundUp]}
            tick={{ fill: MUTED, fontSize: 12 }}
            stroke={GRID}
            width={48}
            unit=""
          />
          <ReferenceLine y={800} stroke="#d9a400" strokeDasharray="4 4" ifOverflow="hidden" />
          <ReferenceLine y={1200} stroke="#d64545" strokeDasharray="4 4" ifOverflow="hidden" />
          <Tooltip
            labelFormatter={(t) =>
              new Date(t as number).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            }
            formatter={(v) => [`${Math.round(Number(v))} ppm`, 'CO₂']}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
            }}
          />
          <Line
            type="monotone"
            dataKey="ppm"
            stroke={LINE_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-legend">
        <span className="swatch" style={{ background: '#d9a400' }} /> 800 ppm: getting stuffy
        <span className="swatch" style={{ background: '#d64545' }} /> 1200 ppm: ventilate
      </p>
    </div>
  );
}
