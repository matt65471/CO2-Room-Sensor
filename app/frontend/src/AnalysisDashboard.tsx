import { useEffect, useMemo, useState } from 'react';
import {
  fetchHistoryReadings,
  fetchHistoryStats,
  fetchLambda,
  type HistoryReadings,
  type HistoryStats,
  type LambdaResponse,
} from './api';
import { CO2_THRESHOLDS, withGaps } from './components/chartUtils';
import LambdaCard, { VERDICTS } from './components/LambdaCard';
import MetricChart, { type Band } from './components/MetricChart';
import MetricStatsTable from './components/MetricStatsTable';
import TimeWindowPicker, { lastWindow, type TimeWindow } from './components/TimeWindowPicker';
import { METRICS, METRIC_ORDER, unitLabel, type TempUnit } from './metrics';
import { load, save } from './storage';

const SHOW_DECAYS_KEY = 'co2.showDecays';

function describeBucket(secs: number): string {
  if (secs < 3600) return `${secs / 60} min`;
  if (secs < 86400) return `${secs / 3600} h`;
  return `${secs / 86400} day${secs === 86400 ? '' : 's'}`;
}

interface Props {
  device: string;
  tempUnit: TempUnit;
}

// Past data for a chosen window: one chart and one statistics table per measurement
export default function AnalysisDashboard({ device, tempUnit }: Props) {
  const [span, setSpan] = useState<TimeWindow>(() => lastWindow(24 * 3600 * 1000));
  const [readings, setReadings] = useState<HistoryReadings | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [lambda, setLambda] = useState<LambdaResponse | null>(null);
  const [showDecays, setShowDecays] = useState(() => load(SHOW_DECAYS_KEY) !== 'false');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadings(null);
    setStats(null);
    setLambda(null);
    setError(null);
    fetchHistoryReadings(device, span.from, span.to)
      .then((r) => !cancelled && setReadings(r))
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchHistoryStats(device, span.from, span.to)
      .then((s) => !cancelled && setStats(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchLambda(device, span.from, span.to)
      .then((l) => !cancelled && setLambda(l))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device, span]);

  const points = useMemo(
    () => (readings ? withGaps(readings.points, readings.bucketSecs, tempUnit) : null),
    [readings, tempUnit],
  );
  const decayBands = useMemo<Band[]>(
    () =>
      showDecays && lambda
        ? lambda.decays.map((d) => ({ x1: Date.parse(d.start), x2: Date.parse(d.end), color: VERDICTS[d.verdict].color }))
        : [],
    [lambda, showDecays],
  );

  function chooseShowDecays(show: boolean) {
    setShowDecays(show);
    save(SHOW_DECAYS_KEY, String(show));
  }

  const start = span.from.getTime();
  const end = span.to.getTime();

  return (
    <>
      <TimeWindowPicker value={span} onChange={setSpan} />

      {error && <div className="error">Couldn't load data: {error}</div>}

      <LambdaCard data={lambda} showDecays={showDecays} onShowDecays={chooseShowDecays} />

      {METRIC_ORDER.map((m) => (
        <section key={m} className="card analysis-row">
          <div className="analysis-chart">
            <div className="card-header tight">
              <h2>
                {METRICS[m].label} <span className="muted">({unitLabel(m, tempUnit)})</span>
              </h2>
              {m === 'co2' && (
                <span className="chart-legend inline">
                  {CO2_THRESHOLDS.map((t) => (
                    <span key={t.ppm}>
                      <span className="swatch" style={{ background: t.color }} /> {t.ppm}: {t.label}
                    </span>
                  ))}
                </span>
              )}
              {m === 'co2' && readings && (
                <span className="muted small">Each point averages {describeBucket(readings.bucketSecs)}</span>
              )}
            </div>
            <MetricChart
              metric={m}
              points={points}
              start={start}
              end={end}
              tempUnit={tempUnit}
              syncId="analysis"
              bands={m === 'co2' ? decayBands : undefined}
            />
          </div>
          <div className="analysis-stats">
            <MetricStatsTable metric={m} stats={stats ? stats[m] : null} tempUnit={tempUnit} />
          </div>
        </section>
      ))}
    </>
  );
}
