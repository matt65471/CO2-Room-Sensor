// Data Analysis tab: graph points (GET /history/readings) and statistics (GET /history/stats)
// for any chosen window

import { Router } from 'express';
import { pickBucketSecs } from '../analysis/buckets.js';
import { num } from '../db/rows.js';
import { supabase } from '../db/supabase.js';
import { badRequest, dbError, WINDOW_HELP, windowQuery } from './http.js';

export const historyRouter = Router();

// Graph points, averaged into buckets wide enough to keep a few hundred points
historyRouter.get('/history/readings', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, WINDOW_HELP);
    return;
  }
  const { device } = parsed.data;
  const from = new Date(parsed.data.from).toISOString();
  const to = new Date(parsed.data.to).toISOString();
  const bucketSecs = pickBucketSecs((Date.parse(to) - Date.parse(from)) / 1000);

  const { data, error } = await supabase.rpc('get_readings_between', {
    p_device: device,
    p_from: from,
    p_to: to,
    p_bucket_secs: bucketSecs,
  });
  if (error) {
    dbError(res, error);
    return;
  }
  res.json({
    from,
    to,
    bucketSecs,
    points: (data as { t: string; ppm: unknown; temp_c: unknown; rh_pct: unknown }[]).map((p) => ({
      t: p.t,
      ppm: num(p.ppm),
      tempC: num(p.temp_c),
      rhPct: num(p.rh_pct),
    })),
  });
});

// Mean / median / low / high per measurement
historyRouter.get('/history/stats', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, WINDOW_HELP);
    return;
  }
  const { device } = parsed.data;
  const from = new Date(parsed.data.from).toISOString();
  const to = new Date(parsed.data.to).toISOString();

  const { data, error } = await supabase.rpc('get_stats_between', { p_device: device, p_from: from, p_to: to });
  if (error) {
    dbError(res, error);
    return;
  }
  const rows = data as Record<string, unknown>[];
  const stats = (metric: string) => {
    const row = rows.find((r) => r.metric === metric) ?? {};
    return {
      mean: num(row.mean),
      median: num(row.median),
      low: num(row.low),
      lowAt: (row.low_at as string | null) ?? null,
      high: num(row.high),
      highAt: (row.high_at as string | null) ?? null,
      count: Number(row.readings ?? 0),
    };
  };
  res.json({ from, to, co2: stats('co2'), temp: stats('temp'), humidity: stats('humidity') });
});
