import { useEffect, useMemo, useState } from 'react';
import {
  fetchHistoryReadings,
  fetchHistoryStats,
  fetchRoomModel,
  type HistoryReadings,
  type HistoryStats,
  type RoomModel,
} from '../../api';
import { CO2_THRESHOLDS, withGaps, type Band } from '../../charts/chartUtils';
import GestChart, { GEST_COLOR } from './GestChart';
import MetricChart from './MetricChart';
import MetricStatsTable from './MetricStatsTable';
import { VERDICTS } from './roomModel/colors';
import DecayTable from './roomModel/DecayTable';
import { DecayLegend, OccupancyLegend } from './roomModel/Legends';
import RoomModelSummary from './roomModel/RoomModelSummary';
import TimeWindowPicker, { lastWindow, type TimeWindow } from './TimeWindowPicker';
import { METRICS, METRIC_ORDER, unitLabel, type TempUnit } from '../../lib/metrics';
import { load, save } from '../../lib/storage';

const SHOW_DECAYS_KEY = 'co2.showDecays';
const SHOW_LABELS_KEY = 'co2.showLabels';

function describeBucket(secs: number): string {
  if (secs < 3600) return `${secs / 60} min`;
  if (secs < 86400) return `${secs / 3600} h`;
  return `${secs / 86400} day${secs === 86400 ? '' : 's'}`;
}

interface Props {
  device: string;
  tempUnit: TempUnit;
}

// Past data for a chosen window: one chart and statistics table per measurement, then G_est (what the
// occupants add, from the room model) beside the room air-change rate λ it is computed with
export default function AnalysisDashboard({ device, tempUnit }: Props) {
  const [span, setSpan] = useState<TimeWindow>(() => lastWindow(24 * 3600 * 1000));
  const [readings, setReadings] = useState<HistoryReadings | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [model, setModel] = useState<RoomModel | null>(null);
  const [showDecays, setShowDecays] = useState(() => load(SHOW_DECAYS_KEY) !== 'false');
  const [showLabels, setShowLabels] = useState(() => load(SHOW_LABELS_KEY) !== 'false');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadings(null);
    setStats(null);
    setModel(null);
    setError(null);
    fetchHistoryReadings(device, span.from, span.to)
      .then((r) => !cancelled && setReadings(r))
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchHistoryStats(device, span.from, span.to)
      .then((s) => !cancelled && setStats(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchRoomModel(device, span.from, span.to)
      .then((m) => !cancelled && setModel(m))
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
      showDecays && model
        ? model.decays.map((d) => ({ x1: Date.parse(d.start), x2: Date.parse(d.end), color: VERDICTS[d.verdict].color }))
        : [],
    [model, showDecays],
  );

  function chooseShowDecays(show: boolean) {
    setShowDecays(show);
    save(SHOW_DECAYS_KEY, String(show));
  }

  function chooseShowLabels(show: boolean) {
    setShowLabels(show);
    save(SHOW_LABELS_KEY, String(show));
  }

  const start = span.from.getTime();
  const end = span.to.getTime();

  return (
    <>
      <TimeWindowPicker
        value={span}
        onChange={setSpan}
        note={readings ? `Each graph point averages ${describeBucket(readings.bucketSecs)}` : undefined}
      />

      {error && <div className="error">Couldn't load data: {error}</div>}

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
              {m === 'co2' && showDecays && <DecayLegend />}
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

      <section className="card analysis-row">
        <div className="analysis-chart">
          <div className="card-header tight">
            <h2>
              <span style={{ color: GEST_COLOR }}>
                G<sub>est</sub>
              </span>{' '}
              · CO₂ added by occupants <span className="muted">(ppm/h)</span>
            </h2>
            <span className="muted small">
              G<sub>est</sub> = dC/dt + λ·(C − C<sub>out</sub>) · ≈ 0 means the room is empty
            </span>
            {showLabels && <OccupancyLegend model={model?.occupancy.model ?? null} />}
          </div>
          <GestChart model={model} start={start} end={end} syncId="analysis" showLabels={showLabels} />
        </div>
        <div className="analysis-stats">
          <RoomModelSummary
            model={model}
            showDecays={showDecays}
            onShowDecays={chooseShowDecays}
            showLabels={showLabels}
            onShowLabels={chooseShowLabels}
          />
        </div>
      </section>

      <DecayTable model={model} />
    </>
  );
}
