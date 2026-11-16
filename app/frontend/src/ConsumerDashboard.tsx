import { useEffect, useState } from 'react';
import { fetchReadings, fetchSummary, type Range, type ReadingsResponse, type Summary } from './api';
import MetricToggle from './components/MetricToggle';
import ReadingsChart from './components/ReadingsChart';
import RangeTabs from './components/RangeTabs';
import StatsTable from './components/StatsTable';
import TrendCard from './components/TrendCard';
import { isMetric, type Metric, type TempUnit } from './metrics';
import { load, save } from './storage';

const METRICS_KEY = 'co2.graphMetrics';

function loadSavedMetrics(): Metric[] {
  try {
    const saved = JSON.parse(load(METRICS_KEY) ?? '[]');
    const valid = Array.isArray(saved) ? saved.filter(isMetric) : [];
    return valid.length > 0 ? valid : ['co2'];
  } catch {
    return ['co2'];
  }
}

interface Props {
  device: string;
  tempUnit: TempUnit;
  tick: number; // changes every minute to trigger a refresh
  onError: (message: string | null) => void;
}

// Live view: latest reading and trend, a recent-range graph and past-24-hour statistics
export default function ConsumerDashboard({ device, tempUnit, tick, onError }: Props) {
  const [range, setRange] = useState<Range>('24h');
  const [graphMetrics, setGraphMetrics] = useState<Metric[]>(loadSavedMetrics);
  const [readings, setReadings] = useState<ReadingsResponse | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  // A different sensor's data shouldn't linger while the new one loads
  useEffect(() => {
    setReadings(null);
    setSummary(null);
  }, [device]);

  useEffect(() => {
    let cancelled = false;
    fetchReadings(device, range)
      .then((r) => !cancelled && (setReadings(r), onError(null)))
      .catch((e: Error) => !cancelled && onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device, range, tick, onError]);

  useEffect(() => {
    let cancelled = false;
    fetchSummary(device)
      .then((s) => !cancelled && setSummary(s))
      .catch((e: Error) => !cancelled && onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device, tick, onError]);

  function chooseMetrics(metrics: Metric[]) {
    setGraphMetrics(metrics);
    save(METRICS_KEY, JSON.stringify(metrics));
  }

  return (
    <>
      <TrendCard summary={summary} tempUnit={tempUnit} />

      <section className="card">
        <div className="card-header">
          <h2>Readings</h2>
          <RangeTabs value={range} onChange={setRange} />
        </div>
        <MetricToggle selected={graphMetrics} onChange={chooseMetrics} />
        <ReadingsChart
          data={readings && readings.range === range ? readings : null}
          metrics={graphMetrics}
          tempUnit={tempUnit}
        />
      </section>

      <StatsTable summary={summary} tempUnit={tempUnit} />
    </>
  );
}
