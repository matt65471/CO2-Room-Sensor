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
import type { Range, ReadingsResponse } from '../../api';
import { METRICS, formatDisplayed, unitLabel, type Metric, type TempUnit } from '../../lib/metrics';
import { GRID, MUTED, domainFor, tooltipStyle, withGaps } from '../../charts/chartUtils';

// Fixed axis widths, so the plot area stays the same size whichever measurements are shown.
// Space for the maximum number of right-hand axes is always reserved; unused space becomes margin.
const LEFT_AXIS_WIDTH = 48;
const RIGHT_AXIS_WIDTH = 44;
const MAX_RIGHT_AXES = 2;

function formatTick(time: number, range: Range): string {
  const d = new Date(time);
  if (range === '3d') {
    return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  data: ReadingsResponse | null;
  metrics: Metric[];
  tempUnit: TempUnit;
}

export default function ReadingsChart({ data, metrics, tempUnit }: Props) {
  if (!data) {
    return <div className="chart-placeholder">Loading…</div>;
  }

  const points = withGaps(data.points, data.bucketSecs, tempUnit);
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
            contentStyle={tooltipStyle}
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
