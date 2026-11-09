import type { Summary } from '../api';

function ppm(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ppm`;
}

interface Props {
  summary: Summary | null;
}

export default function StatsTable({ summary }: Props) {
  const s = summary?.last24h;
  const highAt = s?.highAt
    ? new Date(s.highAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="card">
      <h2>Past 24 hours</h2>
      <table className="stats">
        <tbody>
          <tr>
            <th scope="row">Mean</th>
            <td>{s ? ppm(s.mean) : '…'}</td>
          </tr>
          <tr>
            <th scope="row">Median</th>
            <td>{s ? ppm(s.median) : '…'}</td>
          </tr>
          <tr>
            <th scope="row">High</th>
            <td>
              {s ? ppm(s.high) : '…'}
              {highAt && <span className="muted"> at {highAt}</span>}
            </td>
          </tr>
          <tr>
            <th scope="row">Readings</th>
            <td>{s ? s.count.toLocaleString() : '…'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
