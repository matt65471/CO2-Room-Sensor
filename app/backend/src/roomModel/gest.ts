// G_est: how fast the people in the room are pushing CO2 up (ppm per hour), at every moment.
//
// From the room model dC/dt = G − λ·(C − C_out), solved for G:
//   G_est = dC/dt + λ·(C − C_out)
// dC/dt is the slope of a straight line through the readings around each moment (the raw
// minute-to-minute change is far too noisy); C is the mean over the same readings.
// G_est ≈ 0 means nobody is adding CO2 (empty room), whatever the CO2 level.

import type { SeriesPoint } from './lambda.js';

export interface GestPoint {
  t: number; // ms since epoch
  g: number | null; // ppm per hour; null where there are too few readings to fit a slope
}

export const GEST_OPTIONS = {
  slopeWindowMs: 20 * 60 * 1000, // fit dC/dt over this long, centred on each moment
  minPoints: 3, // fewer readings than this in the window: no estimate
};

// Slope (per hour) and mean of the points, by least squares
function slopeAndMean(points: SeriesPoint[]): { slope: number; mean: number } {
  const n = points.length;
  const hours = points.map((p) => p.t / 3_600_000);
  const mx = hours.reduce((s, v) => s + v, 0) / n;
  const my = points.reduce((s, p) => s + p.ppm, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (hours[i] - mx) * (points[i].ppm - my);
    sxx += (hours[i] - mx) ** 2;
  }
  return { slope: sxx === 0 ? 0 : sxy / sxx, mean: my };
}

// points: regularly spaced CO2 readings (5-minute means work well), oldest first
export function computeGest(
  points: SeriesPoint[],
  lambdaPerHour: number,
  baselinePpm: number,
  opts = GEST_OPTIONS,
): GestPoint[] {
  const half = opts.slopeWindowMs / 2;
  const out: GestPoint[] = [];
  let lo = 0;
  let hi = 0;
  for (const p of points) {
    while (points[lo].t < p.t - half) lo++;
    while (hi < points.length && points[hi].t <= p.t + half) hi++;
    const window = points.slice(lo, hi);
    if (window.length < opts.minPoints) {
      out.push({ t: p.t, g: null });
      continue;
    }
    const { slope, mean } = slopeAndMean(window);
    out.push({ t: p.t, g: slope + lambdaPerHour * (mean - baselinePpm) });
  }
  return out;
}

// Average G_est into wider buckets for display. Bucket k covers [origin + k·width, origin + (k+1)·width).
export function bucketGest(points: GestPoint[], origin: number, widthMs: number): GestPoint[] {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    if (p.g === null || p.t < origin) continue;
    const t = origin + Math.floor((p.t - origin) / widthMs) * widthMs;
    const s = sums.get(t) ?? { sum: 0, n: 0 };
    s.sum += p.g;
    s.n++;
    sums.set(t, s);
  }
  return [...sums]
    .sort((a, b) => a[0] - b[0])
    .map(([t, s]) => ({ t, g: s.sum / s.n }));
}
