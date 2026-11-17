import { describe, expect, it } from 'vitest';
import { estimateLambda, fitSettlingLevel, findFalls, type SeriesPoint } from './lambda.js';

const MIN = 60_000;
const STEP = 5 * MIN;
const OUTDOOR = 420;

// Repeatable pseudo-random noise in [-amp, amp]
function noise(seed: number) {
  let s = seed;
  return (amp: number) => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return (s / 2 ** 31 - 0.5) * 2 * amp;
  };
}

// Simulate the room model dC/dt = G − λ·(C − C_out) in 1-minute steps, sampled every 5 minutes.
// Each phase holds a constant generation rate G (ppm/h) and air-change rate λ (per hour).
function simulate(phases: { hours: number; G: number; lambda: number }[], start = OUTDOOR, amp = 4): SeriesPoint[] {
  const jitter = noise(42);
  const out: SeriesPoint[] = [];
  let c = start;
  let t = Date.UTC(2026, 10, 1);
  for (const { hours, G, lambda } of phases) {
    for (let m = 0; m < hours * 60; m++) {
      c += (G - lambda * (c - OUTDOOR)) / 60;
      t += MIN;
      if (t % STEP === 0) out.push({ t, ppm: c + jitter(amp) });
    }
  }
  return out;
}

const occupied = { hours: 6, G: 600, lambda: 0.8 };
const empty = { hours: 6, G: 0, lambda: 0.8 };
const asleep = { hours: 6, G: 350, lambda: 0.3 }; // door shut, lower breathing rate
const day = [occupied, empty];

describe('fitSettlingLevel', () => {
  it('recovers where a clean decay is heading and how fast', () => {
    const pts = simulate([empty], 1200, 0);
    const fit = fitSettlingLevel(pts);
    expect(fit.settlesAt).toBeCloseTo(OUTDOOR, -1);
    expect(fit.lambda).toBeCloseTo(0.8, 1);
  });
});

describe('findFalls', () => {
  it('rides through small noisy upticks but stops at a real rise', () => {
    const pts = simulate([empty, occupied], 1000);
    const falls = findFalls(pts);
    const longest = falls.reduce((a, b) => (b.length > a.length ? b : a));
    expect(longest[0].ppm).toBeGreaterThan(950);
    expect(longest.at(-1)!.t).toBeLessThan(pts[0].t + 6.1 * 3600_000);
  });
});

describe('estimateLambda', () => {
  it('measures λ from empty-room decays', () => {
    const est = estimateLambda(simulate([...day, ...day, ...day]));
    expect(est.samples).toBeGreaterThanOrEqual(3);
    expect(est.lambdaPerHour).toBeGreaterThan(0.7);
    expect(est.lambdaPerHour).toBeLessThan(0.9);
    expect(est.halfLifeHours).toBeCloseTo(Math.LN2 / est.lambdaPerHour!, 6);
    expect(Math.abs(est.baselinePpm! - OUTDOOR)).toBeLessThan(15);
  });

  it('rejects a fall that levels off above baseline (someone asleep)', () => {
    // Busy evening, then asleep: CO2 falls but levels off at 420 + 300/0.8 = 795 ppm,
    // then rises again in the morning before the room empties
    const evening = { hours: 4, G: 1200, lambda: 0.8 };
    const night = { hours: 6, G: 300, lambda: 0.8 };
    const est = estimateLambda(simulate([...day, evening, night, ...day]));
    const nightFall = est.decays.find((d) => d.startPpm > 1500);
    expect(nightFall?.verdict).toBe('settles-above-baseline');
    expect(nightFall?.settlesAt).toBeGreaterThan(700);
    // The night fall must not drag the estimate down
    expect(est.lambdaPerHour).toBeGreaterThan(0.7);
  });

  it('flags a much faster decay as ventilation and leaves it out of λ', () => {
    const windowOpen = { hours: 6, G: 0, lambda: 4 };
    const est = estimateLambda(simulate([...day, ...day, ...day, occupied, windowOpen]));
    expect(est.decays.some((d) => d.verdict === 'ventilation')).toBe(true);
    expect(est.lambdaPerHour).toBeLessThan(1);
  });

  it('marks a short, still-straight fall as inconclusive', () => {
    // 40 minutes of a slow decay toward a high level: barely curved
    const est = estimateLambda(simulate([...day, { hours: 3, G: 1200, lambda: 0.8 }, { hours: 0.75, G: 0, lambda: 0.15 }, occupied]));
    const short = est.decays.find((d) => d.verdict !== 'empty' && d.verdict !== 'settles-above-baseline');
    expect(short === undefined || short.verdict === 'inconclusive').toBe(true);
  });

  it('copes with no data', () => {
    expect(estimateLambda([])).toEqual({
      baselinePpm: null,
      lambdaPerHour: null,
      halfLifeHours: null,
      samples: 0,
      decays: [],
    });
  });

  it('ignores the asleep plateau when there is no empty period at all', () => {
    const est = estimateLambda(simulate([occupied, asleep, occupied, asleep], 900));
    expect(est.samples).toBe(0);
    expect(est.lambdaPerHour).toBeNull();
  });
});
