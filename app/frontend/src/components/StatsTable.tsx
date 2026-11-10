import { useState } from 'react';
import type { Summary } from '../api';
import { METRICS, METRIC_ORDER, formatValue, type Metric, type TempUnit } from '../metrics';

interface Props {
  summary: Summary | null;
  tempUnit: TempUnit;
}

export default function StatsTable({ summary, tempUnit }: Props) {
  const [metric, setMetric] = useState<Metric>('co2');
  const s = summary?.last24h[metric];
  const when = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const lowAt = when(s?.lowAt);
  const highAt = when(s?.highAt);
  const value = (v: number | null | undefined) => (s ? formatValue(metric, v ?? null, tempUnit) : '…');

  return (
    <section className="card">
      <div className="card-header">
        <h2>Past 24 hours</h2>
        <div className="tabs" role="tablist" aria-label="Statistic to show">
          {METRIC_ORDER.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={metric === m}
              className={metric === m ? 'tab active' : 'tab'}
              onClick={() => setMetric(m)}
            >
              {METRICS[m].label}
            </button>
          ))}
        </div>
      </div>

      {s && s.count === 0 ? (
        <p className="muted">
          No {METRICS[metric].label.toLowerCase()} readings in the past 24 hours.
          {metric !== 'co2' && ' Readings include this once the sensor runs the updated firmware.'}
        </p>
      ) : (
        <table className="stats">
          <tbody>
            <tr>
              <th scope="row">Mean</th>
              <td>{value(s?.mean)}</td>
            </tr>
            <tr>
              <th scope="row">Median</th>
              <td>{value(s?.median)}</td>
            </tr>
            <tr>
              <th scope="row">Low</th>
              <td>
                {value(s?.low)}
                {lowAt && <span className="muted"> at {lowAt}</span>}
              </td>
            </tr>
            <tr>
              <th scope="row">High</th>
              <td>
                {value(s?.high)}
                {highAt && <span className="muted"> at {highAt}</span>}
              </td>
            </tr>
            <tr>
              <th scope="row">Readings</th>
              <td>{s ? s.count.toLocaleString() : '…'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
