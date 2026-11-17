import { describe, expect, it } from 'vitest';
import { bucketGest, computeGest } from '../../src/roomModel/gest.js';
import type { SeriesPoint } from '../../src/roomModel/lambda.js';

const MIN = 60_000;
const OUTDOOR = 420;
const LAMBDA = 0.8;

// Simulate dC/dt = G − λ·(C − C_out) in 1-minute steps, sampled every 5 minutes, with small noise
function simulate(phases: { hours: number; G: number }[], start = OUTDOOR): SeriesPoint[] {
  let seed = 7;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return (seed / 2 ** 31 - 0.5) * 6;
  };
  const out: SeriesPoint[] = [];
  let c = start;
  let t = Date.UTC(2026, 10, 1);
  for (const { hours, G } of phases) {
    for (let m = 0; m < hours * 60; m++) {
      c += (G - LAMBDA * (c - OUTDOOR)) / 60;
      t += MIN;
      if (t % (5 * MIN) === 0) out.push({ t, ppm: c + jitter() });
    }
  }
  return out;
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

// Median G_est over [fromH, toH) hours after the start, skipping the edges of each phase
function gBetween(points: SeriesPoint[], fromH: number, toH: number): number {
  const g = computeGest(points, LAMBDA, OUTDOOR);
  const t0 = points[0].t;
  return medianOf(
    g.filter((p) => p.g !== null && p.t - t0 >= fromH * 3600_000 && p.t - t0 < toH * 3600_000).map((p) => p.g!),
  );
}

describe('computeGest', () => {
  it('recovers what the occupants add, whether CO2 is rising, flat or falling', () => {
    // empty, someone arrives (rising), stays (flat), falls asleep (falling to a lower level), leaves
    const pts = simulate([
      { hours: 3, G: 0 },
      { hours: 6, G: 700 },
      { hours: 6, G: 400 },
      { hours: 6, G: 0 },
    ]);
    expect(Math.abs(gBetween(pts, 1, 2.5))).toBeLessThan(40); // empty at baseline
    expect(gBetween(pts, 3.5, 5)).toBeCloseTo(700, -2); // rising fast
    expect(gBetween(pts, 7, 8.5)).toBeCloseTo(700, -2); // flat at ~1300 ppm: slope ≈ 0 but clearly occupied
    expect(gBetween(pts, 9.5, 11)).toBeCloseTo(400, -2); // falling, but someone still there
    expect(Math.abs(gBetween(pts, 15.5, 17))).toBeLessThan(40); // falling because empty
  });

  it('gives no estimate across a gap in readings', () => {
    const pts = simulate([{ hours: 4, G: 500 }]);
    const withGap = [...pts.slice(0, 10), ...pts.slice(30)];
    const g = computeGest(withGap, LAMBDA, OUTDOOR, { slopeWindowMs: 20 * MIN, minPoints: 3 });
    // Points next to the gap still have 3 readings on their own side; nothing is fitted across it
    expect(g.some((p) => p.g === null)).toBe(false);
    const sparse = computeGest([pts[0], pts[20], pts[40]], LAMBDA, OUTDOOR);
    expect(sparse.every((p) => p.g === null)).toBe(true);
  });
});

describe('bucketGest', () => {
  it('averages into buckets aligned to the origin and skips missing values', () => {
    const origin = Date.UTC(2026, 10, 1);
    const pts = [
      { t: origin - 5 * MIN, g: 999 }, // before the origin: dropped
      { t: origin, g: 100 },
      { t: origin + 5 * MIN, g: 200 },
      { t: origin + 10 * MIN, g: null },
      { t: origin + 30 * MIN, g: 50 },
    ];
    expect(bucketGest(pts, origin, 30 * MIN)).toEqual([
      { t: origin, g: 150 },
      { t: origin + 30 * MIN, g: 50 },
    ]);
  });
});
