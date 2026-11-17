// Data Analysis tab: the room model for a chosen window (GET /history/room-model)
//  - λ, the room's air-change rate, learned from how CO2 decays while the room is empty;
//  - G_est over the window: how fast the people in the room are pushing CO2 up, using that λ;
//  - empty / active / asleep labels for G_est, with thresholds learned from the same data.

import { Router } from 'express';
import { pickBucketSecs } from '../analysis/buckets.js';
import { fetchCo2Series } from '../db/readings.js';
import { bucketGest, computeGest } from '../roomModel/gest.js';
import { estimateLambda } from '../roomModel/lambda.js';
import { chooseLookback, LOOKBACK_OPTIONS } from '../roomModel/lookback.js';
import { labelOccupancy, learnOccupancy } from '../roomModel/occupancy.js';
import { badRequest, dbError, WINDOW_HELP, windowQuery } from './http.js';

const iso = (ms: number) => new Date(ms).toISOString();

export const roomModelRouter = Router();

roomModelRouter.get('/history/room-model', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, WINDOW_HELP);
    return;
  }
  const { device } = parsed.data;
  const windowFrom = Date.parse(parsed.data.from);
  const to = Date.parse(parsed.data.to);

  const lookback = chooseLookback(windowFrom, to, Date.now());
  const bucketMs = LOOKBACK_OPTIONS.bucketMs;
  const result = await fetchCo2Series(device, lookback.from, lookback.to, bucketMs / 1000);
  if ('error' in result) {
    dbError(res, result.error);
    return;
  }
  const { points } = result;
  const est = estimateLambda(points);

  // 5-minute G_est over the whole lookback: the occupancy labels learn their thresholds from all of it
  const gest5 =
    est.lambdaPerHour === null || est.baselinePpm === null
      ? []
      : computeGest(points, est.lambdaPerHour, est.baselinePpm);

  // For the graph: the window only, averaged to the same point width as the other charts
  const graphBucketMs = Math.max(pickBucketSecs((to - windowFrom) / 1000) * 1000, bucketMs);
  const gest = bucketGest(
    gest5.filter((p) => p.t < to),
    windowFrom,
    graphBucketMs,
  );

  // Empty / active / asleep for each chunk in the window. Label from an hour before it so the
  // smoothing has context at the left edge, then clip to the window.
  const occupancyModel = learnOccupancy(gest5, est.decays);
  const labelled = labelOccupancy(
    gest5.filter((p) => p.t >= windowFrom - 60 * 60_000),
    occupancyModel,
  );
  const segments = labelled.segments
    .filter((seg) => seg.end > windowFrom && seg.start < to)
    .map((seg) => ({ ...seg, start: Math.max(seg.start, windowFrom), end: Math.min(seg.end, to) }));
  const events = labelled.events.filter((e) => e.t >= windowFrom && e.t <= to);

  res.json({
    from: iso(lookback.from),
    to: iso(lookback.to),
    centred: lookback.centred,
    baselinePpm: est.baselinePpm,
    lambdaPerHour: est.lambdaPerHour,
    halfLifeHours: est.halfLifeHours,
    samples: est.samples,
    decays: est.decays.map((d) => ({ ...d, start: iso(d.start), end: iso(d.end) })),
    gest: {
      bucketSecs: graphBucketMs / 1000,
      points: gest.map((p) => ({ t: iso(p.t), g: p.g === null ? null : Math.round(p.g) })),
    },
    occupancy: {
      model: {
        emptyBelow: Math.round(occupancyModel.emptyBelow),
        emptyLearned: occupancyModel.emptyLearned,
        asleep: occupancyModel.asleep && {
          level: Math.round(occupancyModel.asleep.level),
          steadiness: Math.round(occupancyModel.asleep.steadiness),
        },
        active: occupancyModel.active && {
          level: Math.round(occupancyModel.active.level),
          steadiness: Math.round(occupancyModel.active.steadiness),
        },
        notes: occupancyModel.notes,
      },
      segments: segments.map((seg) => ({ start: iso(seg.start), end: iso(seg.end), label: seg.label })),
      events: events.map((e) => ({ t: iso(e.t), type: e.type })),
    },
  });
});
