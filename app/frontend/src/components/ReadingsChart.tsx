import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Range, ReadingsResponse } from '../api';
import { METRICS, formatDisplayed, toDisplay, unitLabel, type Metric, type TempUnit } from '../metrics';

const MUTED = '#8a8f98';
const GRID = 'rgba(138, 143, 152, 0.25)';

// Fixed axis widths, so the plot area stays the same size whichever measurements are shown.
// Space for the maximum number of right-hand axes is always reserved; unused space becomes margin.
const LEFT_AXIS_WIDTH = 48;
const RIGHT_AXIS_WIDTH = 44;
const MAX_RIGHT_AXES = 2;

type ChartPoint = { time: number; ppm: number | null; tempC: number | null; rhPct: number | null };

// Insert a blank point wherever readings stop for a while (sensor offline), so the lines
// show a gap instead of a misleading straight line across the missing period.
// Temperature is converted to the chosen unit here, so axes and domains work in display units.
function withGaps(data: ReadingsResponse, tempUnit: TempUnit): ChartPoint[] {
  const out: ChartPoint[] = [];
  const maxGapMs = data.bucketSecs * 1000 * 3;
  let prev: number | null = null;
  for (const p of data.points) {
    const time = new Date(p.t).getTime();
    if (prev !== null && time - prev > maxGapMs) {
      out.push({ time: prev + 1, ppm: null, tempC: null, rhPct: null });
    }
    const tempC = p.tempC === null ? null : toDisplay('temp', p.tempC, tempUnit);
    out.push({ time, ppm: p.ppm, tempC, rhPct: p.rhPct });
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

// Y-axis ranges with a little headroom, rounded to tidy numbers. Recharts passes the data's
// min/max; guard against "no data" (Infinity) for a metric with no values in this range.
const safe = (f: (v: number) => number, fallback: number) => (v: number) =>
  Number.isFinite(v) ? f(v) : fallback;

function domainFor(metric: Metric, tempUnit: TempUnit): [(v: number) => number, (v: number) => number] {
  if (metric === 'temp' && tempUnit === 'F') {
    return [safe((v) => Math.floor(v - 2), 59), safe((v) => Math.ceil(v + 2), 86)];
  }
  return DOMAINS[metric];
}

const DOMAINS: Record<Metric, [(v: number) => number, (v: number) => number]> = {
  co2: [safe((v) => Math.max(0, Math.floor((v - 50) / 100) * 100), 400), safe((v) => Math.ceil((v + 50) / 100) * 100, 1000)],
  temp: [safe((v) => Math.floor(v - 1), 15), safe((v) => Math.ceil(v + 1), 30)],
  humidity: [safe((v) => Math.max(0, Math.floor((v - 5) / 5) * 5), 0), safe((v) => Math.min(100, Math.ceil((v + 5) / 5) * 5), 100)],
};

interface Props {
  data: ReadingsResponse | null;
  metrics: Metric[];
  tempUnit: TempUnit;
}

export default function ReadingsChart({ data, metrics, tempUnit }: Props) {
  if (!data) {
    return <div className="chart-placeholder">Loading…</div>;
  }

  const points = withGaps(data, tempUnit);
  const hasData = points.some((p) => metrics.some((m) => p[METRICS[m].key] !== null));
  if (!hasData) {
    const names = metrics.map((m) => METRICS[m].label.toLowerCase()).join(' or ');
    return <div className="chart-placeholder">No {names} readings in this time range.</div>;
  }

  const start = new Date(data.since).getTime();
  const end = Date.now();
  const showCo2 = metrics.includes('co2');
  const rightAxes = metrics.length - 1;

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={points}
          margin={{ top: 8, right: (MAX_RIGHT_AXES - rightAxes) * RIGHT_AXIS_WIDTH, bottom: 0, left: 0 }}
        >
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

          {/* One Y-axis per selected measurement, coloured to match its line: first on the left, others on the right */}
          {metrics.map((m, i) => (
            <YAxis
              key={m}
              yAxisId={m}
              orientation={i === 0 ? 'left' : 'right'}
              domain={domainFor(m, tempUnit)}
              tick={{ fill: METRICS[m].color, fontSize: 12 }}
              tickFormatter={(v: number) => `${v}${m === 'co2' ? '' : unitLabel(m, tempUnit)}`}
              stroke={GRID}
              width={i === 0 ? LEFT_AXIS_WIDTH : RIGHT_AXIS_WIDTH}
              allowDecimals={false}
            />
          ))}

          {showCo2 && (
            <>
              <ReferenceLine yAxisId="co2" y={800} stroke="#d9a400" strokeDasharray="4 4" ifOverflow="hidden" />
              <ReferenceLine yAxisId="co2" y={1200} stroke="#d64545" strokeDasharray="4 4" ifOverflow="hidden" />
            </>
          )}

          <Tooltip
            labelFormatter={(t) =>
              new Date(t as number).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            }
            formatter={(value, _name, item) => {
              const metric = metrics.find((m) => METRICS[m].key === item.dataKey);
              return metric
                ? [formatDisplayed(metric, value === null ? null : Number(value), tempUnit), METRICS[metric].label]
                : [String(value), String(_name)];
            }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
            }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="plainline"
            formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value}</span>}
          />

          {metrics.map((m) => (
            <Line
              key={m}
              yAxisId={m}
              type="monotone"
              dataKey={METRICS[m].key}
              name={`${METRICS[m].label} (${unitLabel(m, tempUnit)})`}
              stroke={METRICS[m].color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {showCo2 && (
        <p className="chart-legend">
          <span className="swatch" style={{ background: '#d9a400' }} /> 800 ppm: getting stuffy
          <span className="swatch" style={{ background: '#d64545' }} /> 1200 ppm: ventilate
        </p>
      )}
    </div>
  );
}
