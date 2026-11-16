// Tidy averaging-bucket widths (seconds), smallest first. 60s matches the sensor's upload interval.
export const BUCKET_STEPS = [
  60, 2 * 60, 5 * 60, 10 * 60, 15 * 60, 30 * 60,
  3600, 2 * 3600, 3 * 3600, 6 * 3600, 12 * 3600, 24 * 3600,
] as const;

// Aim for at most this many points on a graph, however long the chosen window is
export const MAX_POINTS = 400;

// Smallest tidy bucket that keeps the window under MAX_POINTS points.
// Windows longer than MAX_POINTS days fall back to whole days per point.
export function pickBucketSecs(spanSecs: number): number {
  const needed = spanSecs / MAX_POINTS;
  const step = BUCKET_STEPS.find((s) => s >= needed);
  return step ?? Math.ceil(needed / 86400) * 86400;
}
