// Estimate the room's air-change rate λ (per hour) from how CO2 decays while the room is empty.
//
// Model (see README "How the room model works"): dC/dt = G − λ·(C − C_out).
// With nobody in the room G = 0, so the excess over outdoor air decays exponentially:
//   C(t) = C_out + (C₀ − C_out)·e^(−λt)   ⇒   ln(C − C_out) is a straight line with slope −λ.
//
// Steps: estimate C_out from the lowest readings, find stretches where CO2 keeps falling, keep the
// ones that look like an empty room (heading to C_out along a clean exponential), fit λ on each,
// and take the median.

export interface SeriesPoint {
  t: number; // ms since epoch
  ppm: number;
}

export type DecayVerdict =
  | 'empty' // clean exponential decay to the baseline: a λ sample
  | 'ventilation' // also clean, but far faster than usual: door/window open
  | 'settles-above-baseline' // levelling off well above C_out: someone is still there (e.g. asleep)
  | 'inconclusive' // hasn't curved enough to tell where it is heading (usually too short)
  | 'irregular'; // not a clean exponential (people coming and going)

export interface Decay {
  start: number;
  end: number;
  startPpm: number;
  endPpm: number;
  lambda: number; // per hour, from the ln(C − C_out) fit
  r2: number; // of the ln(C − C_out) fit
  settlesAt: number | null; // C_eq from the free fit C = C_eq + A·e^(−λt), or null if it can't be told
  verdict: DecayVerdict;
}

export interface LambdaEstimate {
  baselinePpm: number | null; // C_out
  lambdaPerHour: number | null; // median λ over 'empty' decays
  halfLifeHours: number | null; // time for the excess over baseline to halve: ln 2 / λ
  samples: number; // number of 'empty' decays behind the median
  decays: Decay[]; // every candidate considered, with its verdict
}

export const LAMBDA_OPTIONS = {
  baselinePercentile: 0.02, // C_out = this percentile of the readings
  riseTolerancePpm: 20, // a fall continues through upticks smaller than this (noise)
  maxGapMs: 15 * 60 * 1000, // a gap in readings longer than this ends a fall
  minDurationMs: 45 * 60 * 1000, // shorter falls are too brief to fit reliably
  minStartExcessPpm: 200, // the fall must start this far above baseline
  minDropPpm: 150, // ...and fall at least this much
  fitFloorPpm: 60, // only fit points this far above baseline: closer in, baseline error dominates
  minFitPoints: 6,
  minR2: 0.95, // ln(C − C_out) must be this close to a straight line
  maxSettleAbovePpm: 100, // C_eq further above baseline than this means someone is still in the room
  ventilationFactor: 2.5, // λ this many times the room's median ⇒ door/window open
};

type Options = typeof LAMBDA_OPTIONS;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Ordinary least squares y = a + b·x
function linearFit(x: number[], y: number[]): { a: number; b: number; r2: number; sse: number } {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const sse = Math.max(0, syy - b * sxy);
  return { a, b, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), sse };
}

// Free fit of C = C_eq + A·e^(−λt) without assuming where the decay ends up. For each λ on a
// log-spaced grid the model is linear in C_eq and A, so solve that and keep the best λ.
export function fitSettlingLevel(points: SeriesPoint[]): { settlesAt: number; lambda: number } {
  const t0 = points[0].t;
  const hours = points.map((p) => (p.t - t0) / 3_600_000);
  const ppm = points.map((p) => p.ppm);
  let best = { sse: Infinity, settlesAt: NaN, lambda: NaN };
  for (let i = 0; i <= 240; i++) {
    const lambda = 0.02 * Math.pow(10, (i / 240) * 2.7); // 0.02 … ~10 per hour
    const fit = linearFit(hours.map((h) => Math.exp(-lambda * h)), ppm);
    if (fit.b > 0 && fit.sse < best.sse) best = { sse: fit.sse, settlesAt: fit.a, lambda };
  }
  return best;
}

// Stretches where CO2 keeps falling: each starts where it begins to drop and ends at its lowest
// point, before CO2 rises again by more than the noise tolerance or the readings stop.
export function findFalls(points: SeriesPoint[], opts: Options = LAMBDA_OPTIONS): SeriesPoint[][] {
  const falls: SeriesPoint[][] = [];
  let i = 0;
  while (i < points.length - 1) {
    if (points[i + 1].ppm >= points[i].ppm || points[i + 1].t - points[i].t > opts.maxGapMs) {
      i++;
      continue;
    }
    let lowest = i + 1;
    let j = i + 1;
    while (j + 1 < points.length) {
      const next = points[j + 1];
      if (next.t - points[j].t > opts.maxGapMs || next.ppm > points[lowest].ppm + opts.riseTolerancePpm) break;
      j++;
      if (next.ppm < points[lowest].ppm) lowest = j;
    }
    // Skip any plateau at the top (still occupied, drifting within noise): the decay starts at the
    // last point that is still within noise of the peak
    const fall = points.slice(i, lowest + 1);
    const peak = Math.max(...fall.map((p) => p.ppm));
    let start = 0;
    for (let k = 0; k < fall.length; k++) if (fall[k].ppm >= peak - opts.riseTolerancePpm) start = k;
    falls.push(fall.slice(start));
    i = lowest + 1;
  }
  return falls;
}

function judge(fall: SeriesPoint[], baseline: number, opts: Options): Decay | null {
  const first = fall[0];
  const last = fall[fall.length - 1];
  if (last.t - first.t < opts.minDurationMs) return null;
  if (first.ppm - baseline < opts.minStartExcessPpm || first.ppm - last.ppm < opts.minDropPpm) return null;

  const fitPoints = fall.filter((p) => p.ppm - baseline >= opts.fitFloorPpm);
  if (fitPoints.length < opts.minFitPoints) return null;

  const log = linearFit(
    fitPoints.map((p) => (p.t - first.t) / 3_600_000),
    fitPoints.map((p) => Math.log(p.ppm - baseline)),
  );
  const { settlesAt } = fitSettlingLevel(fall);

  // A fit that lands far *below* baseline means the fall is still nearly a straight line, so its
  // end point can't be told yet
  const knowable = Number.isFinite(settlesAt) && settlesAt >= baseline - opts.maxSettleAbovePpm;

  let verdict: DecayVerdict = 'empty';
  if (!knowable) verdict = 'inconclusive';
  else if (settlesAt - baseline > opts.maxSettleAbovePpm) verdict = 'settles-above-baseline';
  else if (log.r2 < opts.minR2 || -log.b <= 0) verdict = 'irregular';

  return {
    start: first.t,
    end: last.t,
    startPpm: Math.round(first.ppm),
    endPpm: Math.round(last.ppm),
    lambda: -log.b,
    r2: log.r2,
    settlesAt: knowable ? Math.round(settlesAt) : null,
    verdict,
  };
}

// points: CO2 averaged into regular buckets (5 min works well), oldest first
export function estimateLambda(points: SeriesPoint[], opts: Options = LAMBDA_OPTIONS): LambdaEstimate {
  if (points.length === 0) {
    return { baselinePpm: null, lambdaPerHour: null, halfLifeHours: null, samples: 0, decays: [] };
  }
  const baseline = percentile(
    points.map((p) => p.ppm),
    opts.baselinePercentile,
  );
  const decays = findFalls(points, opts)
    .map((f) => judge(f, baseline, opts))
    .filter((d): d is Decay => d !== null);

  // Unusually fast decays are a door or window opening, not the room's normal air exchange
  const clean = decays.filter((d) => d.verdict === 'empty');
  if (clean.length >= 3) {
    const typical = median(clean.map((d) => d.lambda));
    for (const d of clean) if (d.lambda > opts.ventilationFactor * typical) d.verdict = 'ventilation';
  }

  const samples = decays.filter((d) => d.verdict === 'empty');
  const lambda = samples.length > 0 ? median(samples.map((d) => d.lambda)) : null;
  return {
    baselinePpm: Math.round(baseline),
    lambdaPerHour: lambda,
    halfLifeHours: lambda === null ? null : Math.LN2 / lambda,
    samples: samples.length,
    decays,
  };
}
