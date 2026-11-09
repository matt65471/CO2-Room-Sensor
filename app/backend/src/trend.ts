export type TrendDirection = 'rising' | 'falling' | 'steady' | 'insufficient';

// Changes smaller than this (in ppm per hour) count as "steady"
export const STEADY_THRESHOLD_PPM_PER_HOUR = 30;

// A best-fit line through fewer readings than this isn't meaningful
export const MIN_READINGS = 3;

export function classifyTrend(slopePpmPerHour: number | null, readings: number): TrendDirection {
  if (slopePpmPerHour === null || !Number.isFinite(slopePpmPerHour) || readings < MIN_READINGS) {
    return 'insufficient';
  }
  if (slopePpmPerHour >= STEADY_THRESHOLD_PPM_PER_HOUR) {
    return 'rising';
  }
  if (slopePpmPerHour <= -STEADY_THRESHOLD_PPM_PER_HOUR) {
    return 'falling';
  }
  return 'steady';
}
