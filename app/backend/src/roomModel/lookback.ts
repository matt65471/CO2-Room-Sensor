// Which stretch of data the room model learns from (its "lookback"), for a chosen window.
//
//  - At least `minMs` long: one day rarely has enough empty periods to learn λ from.
//  - A window shorter than that is padded equally before and after (centred), so the model learns from
//    the days closest to it on both sides.
//  - If the padding after the window would run past `now` (no data yet), fall back to ending at the
//    window's end and reaching further back instead.
//  - A longer window is used as is, capped to its last `maxMs`.
// Padding is in whole buckets, so the bucket grid lines up with the graph's points (binned from the window start).

export const LOOKBACK_OPTIONS = {
  minMs: 7 * 24 * 3600 * 1000,
  maxMs: 60 * 24 * 3600 * 1000,
  bucketMs: 5 * 60 * 1000,
};

export interface Lookback {
  from: number;
  to: number;
  centred: boolean;
}

export function chooseLookback(windowFrom: number, windowTo: number, now: number, opts = LOOKBACK_OPTIONS): Lookback {
  const { minMs, maxMs, bucketMs } = opts;
  const extraMs = Math.max(0, minMs - (windowTo - windowFrom));
  const halfPadMs = Math.ceil(extraMs / 2 / bucketMs) * bucketMs;
  const centred = extraMs > 0 && windowTo + halfPadMs <= now;
  if (centred) return { from: windowFrom - halfPadMs, to: windowTo + halfPadMs, centred };
  return {
    from: Math.max(windowFrom - Math.ceil(extraMs / bucketMs) * bucketMs, windowTo - maxMs),
    to: windowTo,
    centred,
  };
}
