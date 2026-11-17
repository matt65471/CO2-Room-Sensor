// Consumer Dashboard: the recent-range graph (GET /readings) and the latest reading, trend and
// past-24-hour statistics (GET /summary)

import { Router } from 'express';
import { z } from 'zod';
import { classifyTrend } from '../analysis/trend.js';
import { num } from '../db/rows.js';
import { supabase } from '../db/supabase.js';
import { badRequest, dbError, deviceId } from './http.js';

// How far back each graph range goes, and how wide each averaged point is
const RANGES = {
  '1h': { hours: 1, bucketSecs: 60 }, // matches the sensor's 1-minute upload interval
  '24h': { hours: 24, bucketSecs: 5 * 60 },
  '3d': { hours: 72, bucketSecs: 15 * 60 },
} as const;

const readingsQuery = z.object({ device: deviceId, range: z.enum(['1h', '24h', '3d']) });
const summaryQuery = z.object({ device: deviceId });

export const dashboardRouter = Router();

dashboardRouter.get('/readings', async (req, res) => {
  const parsed = readingsQuery.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, 'Expected ?device=<uuid>&range=1h|24h|3d');
    return;
  }
  const { device, range } = parsed.data;
  const { hours, bucketSecs } = RANGES[range];
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const { data, error } = await supabase.rpc('get_readings', {
    p_device: device,
    p_since: since,
    p_bucket_secs: bucketSecs,
  });
  if (error) {
    dbError(res, error);
    return;
  }
  res.json({
    range,
    since,
    bucketSecs,
    points: (data as { t: string; ppm: unknown; temp_c: unknown; rh_pct: unknown }[]).map((p) => ({
      t: p.t,
      ppm: num(p.ppm),
      tempC: num(p.temp_c),
      rhPct: num(p.rh_pct),
    })),
  });
});

dashboardRouter.get('/summary', async (req, res) => {
  const parsed = summaryQuery.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, 'Expected ?device=<uuid>');
    return;
  }

  const { data, error } = await supabase.rpc('get_summary', { p_device: parsed.data.device });
  if (error) {
    dbError(res, error);
    return;
  }
  const rows = data as Record<string, unknown>[];
  const first = rows[0] ?? {};
  const slope = num(first.slope_ppm_per_hour);
  const hourCount = Number(first.count_1h ?? 0);

  // One row per metric ('co2', 'temp', 'humidity'); the trend/latest columns repeat on every row
  const stats = (metric: string) => {
    const row = rows.find((r) => r.metric === metric) ?? {};
    return {
      mean: num(row.mean_24h),
      median: num(row.median_24h),
      low: num(row.low_24h),
      lowAt: (row.low_at as string | null) ?? null,
      high: num(row.high_24h),
      highAt: (row.high_at as string | null) ?? null,
      count: Number(row.count_24h ?? 0),
    };
  };

  res.json({
    last24h: {
      co2: stats('co2'),
      temp: stats('temp'),
      humidity: stats('humidity'),
    },
    lastHour: {
      slopePpmPerHour: slope === null ? null : Math.round(slope),
      direction: classifyTrend(slope, hourCount),
      first: num(first.first_1h),
      latest: num(first.latest_1h),
      count: hourCount,
    },
    latestTempC: num(first.latest_temp_c),
    latestRhPct: num(first.latest_rh_pct),
  });
});
