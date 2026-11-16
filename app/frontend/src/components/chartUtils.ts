// Helpers shared by the Consumer Dashboard chart and the Data Analysis charts
import type { Point } from '../api';
import { toDisplay, type Metric, type TempUnit } from '../metrics';

export const MUTED = '#8a8f98';
export const GRID = 'rgba(138, 143, 152, 0.25)';

export const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
};

export type ChartPoint = { time: number; ppm: number | null; tempC: number | null; rhPct: number | null };

// Insert a blank point wherever readings stop for a while (sensor offline), so the lines
// show a gap instead of a misleading straight line across the missing period.
// Temperature is converted to the chosen unit here, so axes and domains work in display units.
export function withGaps(points: Point[], bucketSecs: number, tempUnit: TempUnit): ChartPoint[] {
  const out: ChartPoint[] = [];
  const maxGapMs = bucketSecs * 1000 * 3;
  let prev: number | null = null;
  for (const p of points) {
    const time = new Date(p.t).getTime();
    if (prev !== null && time - prev > maxGapMs) {
      out.push({ time: prev + 1, ppm: null, tempC: null, rhPct: null });
    }
    const tempC = p.tempC === null ? null : toDisplay('temp', p.tempC, tempUnit);
    out.push({ time, ppm: p.ppm, tempC, rhPct: p.rhPct });
    prev = time;
  }
  return out;
}

// Y-axis ranges with a little headroom, rounded to tidy numbers. Recharts passes the data's
// min/max; guard against "no data" (Infinity) for a metric with no values in this range.
const safe = (f: (v: number) => number, fallback: number) => (v: number) =>
  Number.isFinite(v) ? f(v) : fallback;

type Domain = [(v: number) => number, (v: number) => number];

const DOMAINS: Record<Metric, Domain> = {
  co2: [safe((v) => Math.max(0, Math.floor((v - 50) / 100) * 100), 400), safe((v) => Math.ceil((v + 50) / 100) * 100, 1000)],
  temp: [safe((v) => Math.floor(v - 1), 15), safe((v) => Math.ceil(v + 1), 30)],
  humidity: [safe((v) => Math.max(0, Math.floor((v - 5) / 5) * 5), 0), safe((v) => Math.min(100, Math.ceil((v + 5) / 5) * 5), 100)],
};

export function domainFor(metric: Metric, tempUnit: TempUnit): Domain {
  if (metric === 'temp' && tempUnit === 'F') {
    return [safe((v) => Math.floor(v - 2), 59), safe((v) => Math.ceil(v + 2), 86)];
  }
  return DOMAINS[metric];
}

// CO2 guide lines drawn on charts
export const CO2_THRESHOLDS = [
  { ppm: 800, color: '#d9a400', label: 'getting stuffy' },
  { ppm: 1200, color: '#d64545', label: 'ventilate' },
] as const;
