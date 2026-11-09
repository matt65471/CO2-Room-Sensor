// The three things the SCD41 measures, and how to label, colour and format each one

export type Metric = 'co2' | 'temp' | 'humidity';

export interface MetricInfo {
  label: string;
  unit: string;
  color: string;
  key: 'ppm' | 'tempC' | 'rhPct'; // field name in API points
  decimals: number;
}

export const METRICS: Record<Metric, MetricInfo> = {
  co2: { label: 'CO₂', unit: 'ppm', color: '#2f7de1', key: 'ppm', decimals: 0 },
  temp: { label: 'Temperature', unit: '°C', color: '#e8743b', key: 'tempC', decimals: 1 },
  humidity: { label: 'Humidity', unit: '%', color: '#1aa39a', key: 'rhPct', decimals: 1 },
};

// Display order everywhere (toggles, axes, stats tabs)
export const METRIC_ORDER: Metric[] = ['co2', 'temp', 'humidity'];

export function isMetric(value: unknown): value is Metric {
  return typeof value === 'string' && value in METRICS;
}

export function formatValue(metric: Metric, value: number | null): string {
  if (value === null) return '—';
  const { unit, decimals } = METRICS[metric];
  const separator = unit === 'ppm' ? ' ' : '';
  return `${value.toFixed(decimals)}${separator}${unit}`;
}
