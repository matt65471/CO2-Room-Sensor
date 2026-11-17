import { describe, expect, it } from 'vitest';
import type { GestPoint } from './gest.js';
import type { Decay } from './lambda.js';
import { labelOccupancy, learnOccupancy, type OccupancyLabel } from './occupancy.js';

const MIN = 60_000;
const START = Date.UTC(2026, 10, 1);

// Repeatable pseudo-random noise in [-1, 1]
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return (s / 2 ** 31 - 0.5) * 2;
  };
}

// Synthetic 5-minute G_est: each phase has a typical level and how much it jumps around
const PHASE = {
  empty: { level: 0, jitter: 30 },
  active: { level: 700, jitter: 250 }, // moving about: jumpy
  asleep: { level: 440, jitter: 20 }, // steady
} as const;

function series(phases: { label: keyof typeof PHASE; minutes: number }[], seed = 1) {
  const noise = rng(seed);
  const points: GestPoint[] = [];
  const truth: { t: number; label: keyof typeof PHASE }[] = [];
  let t = START;
  for (const { label, minutes } of phases) {
    for (let m = 0; m < minutes; m += 5) {
      points.push({ t, g: PHASE[label].level + noise() * PHASE[label].jitter });
      truth.push({ t, label });
      t += 5 * MIN;
    }
  }
  return { points, truth };
}

// A week-like lookback: days out, evenings active, nights asleep
function week() {
  const day = [
    { label: 'asleep', minutes: 8 * 60 },
    { label: 'active', minutes: 90 },
    { label: 'empty', minutes: 7 * 60 },
    { label: 'active', minutes: 6 * 60 },
    { label: 'empty', minutes: 60 },
    { label: 'active', minutes: 90 },
  ] as const;
  return series(Array.from({ length: 7 }, () => day).flat());
}

// The λ step reports the empty stretches as empty-room falls
function emptyFalls(truth: { t: number; label: string }[]): Decay[] {
  const out: Decay[] = [];
  for (let i = 0; i < truth.length; i++) {
    if (truth[i].label !== 'empty' || truth[i - 1]?.label === 'empty') continue;
    let j = i;
    while (truth[j + 1]?.label === 'empty') j++;
    out.push({ start: truth[i].t, end: truth[j].t, startPpm: 0, endPpm: 0, lambda: 1, r2: 1, settlesAt: 440, verdict: 'empty' });
  }
  return out;
}

const labelAt = (segments: { start: number; end: number; label: OccupancyLabel }[], t: number) =>
  segments.find((s) => t >= s.start && t < s.end)?.label;

describe('learnOccupancy', () => {
  it('learns the empty threshold from known-empty time and finds steady (asleep) vs jumpy (active) groups', () => {
    const { points, truth } = week();
    const model = learnOccupancy(points, emptyFalls(truth));
    expect(model.emptyLearned).toBe(true);
    // Above the empty noise, well below anyone being there
    expect(model.emptyBelow).toBeGreaterThan(PHASE.empty.level);
    expect(model.emptyBelow).toBeLessThan(PHASE.asleep.level / 2);
    expect(model.asleep!.level).toBeCloseTo(440, -2);
    expect(model.asleep!.steadiness).toBeLessThan(model.active!.steadiness);
    expect(model.active!.level).toBeGreaterThan(model.asleep!.level);
    expect(model.notes).toEqual([]);
  });

  it('falls back to a default empty threshold without known-empty periods', () => {
    const { points } = week();
    const model = learnOccupancy(points, []);
    expect(model.emptyLearned).toBe(false);
    expect(model.emptyBelow).toBe(150);
    expect(model.notes.length).toBe(1);
  });

  it("doesn't invent sleep when occupied time shows only one pattern", () => {
    const { points, truth } = series(
      Array.from({ length: 7 }, () => [
        { label: 'empty' as const, minutes: 10 * 60 },
        { label: 'active' as const, minutes: 14 * 60 },
      ]).flat(),
    );
    const model = learnOccupancy(points, emptyFalls(truth));
    expect(model.asleep).toBeNull();
    const { segments } = labelOccupancy(points, model);
    expect(segments.some((s) => s.label === 'asleep')).toBe(false);
  });

  it('copes with no data', () => {
    const model = learnOccupancy([], []);
    expect(model.asleep).toBeNull();
    expect(labelOccupancy([], model)).toEqual({ segments: [], events: [] });
  });
});

describe('labelOccupancy', () => {
  const { points: lookback, truth: lookbackTruth } = week();
  const model = learnOccupancy(lookback, emptyFalls(lookbackTruth));

  it('labels a day and marks each change of state', () => {
    const { points, truth } = series(
      [
        { label: 'empty', minutes: 120 },
        { label: 'active', minutes: 180 },
        { label: 'asleep', minutes: 7 * 60 },
        { label: 'active', minutes: 120 },
        { label: 'empty', minutes: 120 },
      ],
      7,
    );
    const { segments, events } = labelOccupancy(points, model);

    // Away from the transitions (smoothing blurs ±30 min), every chunk matches
    const settled = truth.filter((p) => truth.every((q) => q.label === p.label || Math.abs(q.t - p.t) > 35 * MIN));
    const correct = settled.filter((p) => labelAt(segments, p.t) === p.label).length;
    expect(correct / settled.length).toBeGreaterThan(0.95);

    expect(events.map((e) => e.type)).toEqual(['arrived', 'fell-asleep', 'woke-up', 'left']);
    const at = (minutes: number) => START + minutes * MIN;
    const expected = [at(120), at(300), at(720), at(840)];
    events.forEach((e, i) => expect(Math.abs(e.t - expected[i])).toBeLessThanOrEqual(30 * MIN));
  });

  it('ignores a brief blip instead of reporting events', () => {
    const { points } = series(
      [
        { label: 'asleep', minutes: 180 },
        { label: 'active', minutes: 10 },
        { label: 'asleep', minutes: 180 },
      ],
      3,
    );
    const { events } = labelOccupancy(points, model);
    expect(events).toEqual([]);
  });

  it('calls a short steady stretch active, not asleep', () => {
    const { points } = series(
      [
        { label: 'active', minutes: 180 },
        { label: 'asleep', minutes: 40 },
        { label: 'active', minutes: 180 },
      ],
      5,
    );
    const { segments } = labelOccupancy(points, model);
    expect(segments.some((s) => s.label === 'asleep')).toBe(false);
  });

  it('marks a gap in readings as unknown, with no events across it', () => {
    const { points } = series([{ label: 'active', minutes: 240 }], 9);
    const withGap = points.map((p, i) => (i >= 20 && i < 30 ? { t: p.t, g: null } : p));
    const { segments, events } = labelOccupancy(withGap, model);
    expect(segments.some((s) => s.label === 'unknown')).toBe(true);
    expect(events).toEqual([]);
  });
});
