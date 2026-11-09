import type { Summary, TrendDirection } from '../api';

const TREND: Record<TrendDirection, { arrow: string; label: string }> = {
  rising: { arrow: '↑', label: 'Rising' },
  falling: { arrow: '↓', label: 'Falling' },
  steady: { arrow: '→', label: 'Steady' },
  insufficient: { arrow: '·', label: 'Not enough data' },
};

function airQuality(ppm: number): { label: string; level: 'good' | 'fair' | 'poor' } {
  if (ppm < 800) return { label: 'Fresh', level: 'good' };
  if (ppm < 1200) return { label: 'Getting stuffy', level: 'fair' };
  return { label: 'Ventilate', level: 'poor' };
}

interface Props {
  summary: Summary | null;
}

export default function TrendCard({ summary }: Props) {
  if (!summary) {
    return <section className="card trend">Loading…</section>;
  }

  const { latest, direction, slopePpmPerHour, count } = summary.lastHour;
  const trend = TREND[direction];
  const quality = latest === null ? null : airQuality(latest);
  const slope =
    slopePpmPerHour === null ? '' : `${slopePpmPerHour > 0 ? '+' : ''}${slopePpmPerHour} ppm/hour`;

  return (
    <section className="card trend">
      <div className="trend-now">
        <span className="muted">Latest</span>
        <span className="big">{latest === null ? '—' : latest}</span>
        <span className="muted">ppm</span>
        {quality && <span className={`badge ${quality.level}`}>{quality.label}</span>}
      </div>
      <div className={`trend-dir ${direction}`}>
        <span className="arrow" aria-hidden>
          {trend.arrow}
        </span>
        <div>
          <div className="trend-label">
            {trend.label}
            {direction !== 'insufficient' && slope && <span className="muted"> · {slope}</span>}
          </div>
          <div className="muted small">
            {direction === 'insufficient'
              ? 'Fewer than 3 readings in the past hour'
              : `Trend over the past hour, from ${count} readings`}
          </div>
        </div>
      </div>
    </section>
  );
}
