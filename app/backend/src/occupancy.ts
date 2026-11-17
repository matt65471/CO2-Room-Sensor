// Label each 5-minute G_est chunk as empty, active or asleep, using thresholds learned from the data.
//
//  - Empty threshold: G_est is ≈ 0 when nobody is there, so measure its noise during the empty-room falls
//    the λ step already found, and call anything within 4σ of that "empty".
//  - Active vs asleep: occupied chunks fall into two groups, steady (asleep) and jumpy (active). Find them
//    with 2-cluster k-means on each chunk's level and steadiness, so the split adapts to the room, the
//    season and how many people there are, instead of being a fixed number.
// See README "Labelling G_est".

import type { GestPoint } from './gest.js';
import type { Decay } from './lambda.js';

export type OccupancyLabel = 'empty' | 'active' | 'asleep' | 'unknown';
export type OccupancyEventType = 'arrived' | 'left' | 'fell-asleep' | 'woke-up';

export interface OccupancySegment {
  start: number;
  end: number;
  label: OccupancyLabel;
}

export interface OccupancyEvent {
  t: number;
  type: OccupancyEventType;
}

interface Cluster {
  level: number; // typical G_est, ppm/h (median of the cluster's chunks)
  steadiness: number; // typical variation, ppm/h (median of the cluster's chunks)
  centre: [number, number]; // in standardized (level, ln steadiness) space, for classifying
}

export interface OccupancyModel {
  emptyBelow: number; // ppm/h
  emptyLearned: boolean; // false when there were no known-empty periods to learn from
  asleep: Cluster | null; // null when there wasn't enough occupied data to learn two groups
  active: Cluster | null;
  scale: { mean: [number, number]; sd: [number, number] }; // standardization of (level, ln steadiness)
  notes: string[];
}

export const OCCUPANCY_OPTIONS = {
  bucketMs: 5 * 60_000, // G_est comes in 5-minute chunks
  levelHalfWindowMs: 15 * 60_000, // level = median G_est within ±15 min
  steadinessHalfWindowMs: 30 * 60_000, // steadiness = median absolute deviation within ±30 min
  minWindowPoints: 3,
  emptySkipMs: 20 * 60_000, // skip the start of each empty fall: the slope window still sees the person leaving
  emptySigmas: 4, // empty = within this many robust σ of the empty-room level
  minEmptySamples: 30,
  defaultEmptyBelow: 150, // used when there are no known-empty periods
  minOccupiedSamples: 100, // fewer occupied chunks than this: don't try to learn sleep
  minClusterShare: 0.1, // each group must hold at least this share of occupied chunks
  // k-means always splits data in two, even with only one pattern. Sleep only counts if the steady group
  // is clearly calmer: this room's week gives 5.9×, while an all-active week still splits at about 1.7×.
  minSteadinessRatio: 2.5,
  kmeansSeedShare: 0.1, // start from the steadiest and jumpiest 10%
  minSleepMs: 60 * 60_000, // shorter "asleep" runs are relabelled active
  minRunMs: 15 * 60_000, // shorter runs take the previous run's label (removes flicker)
};

type Options = typeof OCCUPANCY_OPTIONS;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

interface Features {
  t: number;
  level: number | null;
  steadiness: number | null;
}

// Smoothed level and steadiness for every chunk (null where too few G_est values are nearby)
export function chunkFeatures(points: GestPoint[], opts: Options = OCCUPANCY_OPTIONS): Features[] {
  const known = points.filter((p): p is { t: number; g: number } => p.g !== null);
  const values = (t: number, half: number) => {
    const out: number[] = [];
    for (const p of known) if (Math.abs(p.t - t) <= half) out.push(p.g);
    return out;
  };
  return points.map((p) => {
    if (p.g === null) return { t: p.t, level: null, steadiness: null };
    const near = values(p.t, opts.levelHalfWindowMs);
    const wide = values(p.t, opts.steadinessHalfWindowMs);
    return {
      t: p.t,
      level: near.length >= opts.minWindowPoints ? median(near) : null,
      steadiness: wide.length >= opts.minWindowPoints ? mad(wide) : null,
    };
  });
}

function standardize(level: number, steadiness: number, scale: OccupancyModel['scale']): [number, number] {
  return [
    (level - scale.mean[0]) / scale.sd[0],
    (Math.log(Math.max(steadiness, 1)) - scale.mean[1]) / scale.sd[1],
  ];
}

const dist2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// Learn the empty threshold and the active/asleep groups from a lookback of 5-minute G_est
export function learnOccupancy(points: GestPoint[], decays: Decay[], opts: Options = OCCUPANCY_OPTIONS): OccupancyModel {
  const notes: string[] = [];
  const feats = chunkFeatures(points, opts);

  // 1. Empty threshold from the noise of G_est during known-empty falls
  const emptyFalls = decays.filter((d) => d.verdict === 'empty');
  const emptyLevels = feats
    .filter((f) => f.level !== null && emptyFalls.some((d) => f.t >= d.start + opts.emptySkipMs && f.t <= d.end))
    .map((f) => f.level!);
  let emptyBelow = opts.defaultEmptyBelow;
  const emptyLearned = emptyLevels.length >= opts.minEmptySamples;
  if (emptyLearned) {
    emptyBelow = median(emptyLevels) + opts.emptySigmas * 1.4826 * mad(emptyLevels);
  } else {
    notes.push(`No clean empty-room periods to learn from; using ${opts.defaultEmptyBelow} ppm/h as the empty threshold.`);
  }

  // 2. Two groups among occupied chunks, by level and ln(steadiness)
  const occupied = feats.filter(
    (f): f is { t: number; level: number; steadiness: number } =>
      f.level !== null && f.steadiness !== null && f.level >= emptyBelow,
  );
  const unlearned = (note: string): OccupancyModel => {
    notes.push(note);
    return { emptyBelow, emptyLearned, asleep: null, active: null, scale: { mean: [0, 0], sd: [1, 1] }, notes };
  };
  if (occupied.length < opts.minOccupiedSamples) {
    return unlearned('Not enough occupied time to learn what sleep looks like; occupied time is labelled active.');
  }

  const raw = occupied.map((f) => [f.level, Math.log(Math.max(f.steadiness, 1))] as [number, number]);
  const mean: [number, number] = [0, 1].map((d) => raw.reduce((s, r) => s + r[d], 0) / raw.length) as [number, number];
  const sd: [number, number] = [0, 1].map(
    (d) => Math.sqrt(raw.reduce((s, r) => s + (r[d] - mean[d]) ** 2, 0) / raw.length) || 1,
  ) as [number, number];
  const scale = { mean, sd };
  const z = occupied.map((f) => standardize(f.level, f.steadiness, scale));

  const centroid = (idx: number[]): [number, number] => [
    idx.reduce((s, i) => s + z[i][0], 0) / idx.length,
    idx.reduce((s, i) => s + z[i][1], 0) / idx.length,
  ];
  const bySteadiness = z.map((_, i) => i).sort((a, b) => z[a][1] - z[b][1]);
  const seed = Math.max(1, Math.floor(z.length * opts.kmeansSeedShare));
  let centres: [[number, number], [number, number]] = [
    centroid(bySteadiness.slice(0, seed)),
    centroid(bySteadiness.slice(-seed)),
  ];
  let assign: number[] = [];
  for (let iter = 0; iter < 50; iter++) {
    const next = z.map((p) => (dist2(p, centres[0]) <= dist2(p, centres[1]) ? 0 : 1));
    if (next.every((a, i) => a === assign[i])) break;
    assign = next;
    const groups = [0, 1].map((c) => z.map((_, i) => i).filter((i) => assign[i] === c));
    if (groups.some((g) => g.length === 0)) break;
    centres = [centroid(groups[0]), centroid(groups[1])];
  }

  const members = [0, 1].map((c) => occupied.filter((_, i) => assign[i] === c));
  if (members.some((m) => m.length < occupied.length * opts.minClusterShare)) {
    return unlearned('Occupied time shows only one pattern, so sleep could not be told apart; it is labelled active.');
  }
  const clusters = [0, 1].map(
    (c): Cluster => ({
      level: median(members[c].map((f) => f.level)),
      steadiness: median(members[c].map((f) => f.steadiness)),
      centre: centres[c],
    }),
  );
  // The steadier group is sleep, if it really is a different pattern
  const [asleep, active] = clusters[0].steadiness <= clusters[1].steadiness ? clusters : [clusters[1], clusters[0]];
  if (active.steadiness < opts.minSteadinessRatio * Math.max(asleep.steadiness, 1)) {
    return unlearned('Occupied time shows only one pattern, so sleep could not be told apart; it is labelled active.');
  }
  return { emptyBelow, emptyLearned, asleep, active, scale, notes };
}

const EVENT: Partial<Record<`${OccupancyLabel}>${OccupancyLabel}`, OccupancyEventType>> = {
  'empty>active': 'arrived',
  'empty>asleep': 'arrived',
  'active>empty': 'left',
  'asleep>empty': 'left',
  'active>asleep': 'fell-asleep',
  'asleep>active': 'woke-up',
};

// Label 5-minute G_est chunks with a learned model, then tidy the result into segments and events
export function labelOccupancy(
  points: GestPoint[],
  model: OccupancyModel,
  opts: Options = OCCUPANCY_OPTIONS,
): { segments: OccupancySegment[]; events: OccupancyEvent[] } {
  const feats = chunkFeatures(points, opts);
  const labels: OccupancyLabel[] = feats.map((f) => {
    if (f.level === null || f.steadiness === null) return 'unknown';
    if (f.level < model.emptyBelow) return 'empty';
    if (!model.asleep || !model.active) return 'active';
    const p = standardize(f.level, f.steadiness, model.scale);
    return dist2(p, model.asleep.centre) < dist2(p, model.active.centre) ? 'asleep' : 'active';
  });

  // Runs of the same label over back-to-back chunks (a gap in the data also ends a run)
  type Run = { from: number; to: number; label: OccupancyLabel };
  const runs = (): Run[] => {
    const out: Run[] = [];
    for (let i = 0; i < labels.length; i++) {
      const last = out[out.length - 1];
      const joined = last && last.label === labels[i] && feats[i].t - feats[i - 1].t <= 2 * opts.bucketMs;
      if (joined) last.to = i;
      else out.push({ from: i, to: i, label: labels[i] });
    }
    return out;
  };
  const length = (r: Run) => feats[r.to].t - feats[r.from].t + opts.bucketMs;
  const contiguous = (a: Run, b: Run) => feats[b.from].t - feats[a.to].t <= 2 * opts.bucketMs;
  const relabel = (r: Run, label: OccupancyLabel) => {
    for (let i = r.from; i <= r.to; i++) labels[i] = label;
  };

  // Sleep needs to last a while; a short steady stretch is more likely sitting quietly
  for (const r of runs()) if (r.label === 'asleep' && length(r) < opts.minSleepMs) relabel(r, 'active');

  // Remove flicker: a short run takes the label of the run before it (or after it, at the very start)
  for (let changed = true; changed; ) {
    changed = false;
    const rs = runs();
    for (let k = 0; k < rs.length; k++) {
      const r = rs[k];
      if (r.label === 'unknown' || length(r) >= opts.minRunMs) continue;
      const prev = rs[k - 1];
      const next = rs[k + 1];
      const donor =
        prev && prev.label !== 'unknown' && contiguous(prev, r)
          ? prev
          : next && next.label !== 'unknown' && contiguous(r, next)
            ? next
            : null;
      if (donor && donor.label !== r.label) {
        relabel(r, donor.label);
        changed = true;
        break;
      }
    }
  }

  const final = runs();
  const segments = final.map((r) => ({ start: feats[r.from].t, end: feats[r.to].t + opts.bucketMs, label: r.label }));
  const events: OccupancyEvent[] = [];
  for (let k = 1; k < final.length; k++) {
    if (!contiguous(final[k - 1], final[k])) continue;
    const type = EVENT[`${final[k - 1].label}>${final[k].label}`];
    if (type) events.push({ t: feats[final[k].from].t, type });
  }
  return { segments, events };
}
