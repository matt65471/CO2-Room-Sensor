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

// Temperature is stored in °C; the viewer can choose to see it in °F instead
export type TempUnit = 'C' | 'F';

export function isTempUnit(value: unknown): value is TempUnit {
  return value === 'C' || value === 'F';
}

// Convert a stored value into the unit it is displayed in
export function toDisplay(metric: Metric, value: number, tempUnit: TempUnit): number {
  return metric === 'temp' && tempUnit === 'F' ? (value * 9) / 5 + 32 : value;
}

export function unitLabel(metric: Metric, tempUnit: TempUnit): string {
  return metric === 'temp' ? `°${tempUnit}` : METRICS[metric].unit;
}

// Format a value that is already in display units (e.g. chart points)
export function formatDisplayed(metric: Metric, value: number | null, tempUnit: TempUnit): string {
  if (value === null) return '—';
  const unit = unitLabel(metric, tempUnit);
  const separator = unit === 'ppm' ? ' ' : '';
  return `${value.toFixed(METRICS[metric].decimals)}${separator}${unit}`;
}

// Format a stored value (temperature in °C) in the chosen unit
export function formatValue(metric: Metric, value: number | null, tempUnit: TempUnit): string {
  return formatDisplayed(metric, value === null ? null : toDisplay(metric, value, tempUnit), tempUnit);
}
