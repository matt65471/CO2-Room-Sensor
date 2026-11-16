import type { MetricStats } from '../api';
import { METRICS, formatValue, type Metric, type TempUnit } from '../metrics';

interface Props {
  metric: Metric;
  stats: MetricStats | null;
  tempUnit: TempUnit;
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

// Statistics for one measurement over the chosen window (Data Analysis tab)
export default function MetricStatsTable({ metric, stats, tempUnit }: Props) {
  if (stats && stats.count === 0) {
    return <p className="muted small">No {METRICS[metric].label.toLowerCase()} readings in this window.</p>;
  }

  const value = (v: number | null | undefined) => (stats ? formatValue(metric, v ?? null, tempUnit) : '…');
  const lowAt = when(stats?.lowAt ?? null);
  const highAt = when(stats?.highAt ?? null);

  return (
    <table className="stats compact">
      <tbody>
        <tr>
          <th scope="row">Mean</th>
          <td>{value(stats?.mean)}</td>
        </tr>
        <tr>
          <th scope="row">Median</th>
          <td>{value(stats?.median)}</td>
        </tr>
        <tr>
          <th scope="row">Low</th>
          <td>
            {value(stats?.low)}
            {lowAt && <div className="muted at">{lowAt}</div>}
          </td>
        </tr>
        <tr>
          <th scope="row">High</th>
          <td>
            {value(stats?.high)}
            {highAt && <div className="muted at">{highAt}</div>}
          </td>
        </tr>
        <tr>
          <th scope="row">Readings</th>
          <td>{stats ? stats.count.toLocaleString() : '…'}</td>
        </tr>
      </tbody>
    </table>
  );
}
