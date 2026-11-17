import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from './supabase.js';
import { classifyTrend } from './trend.js';
import { pickBucketSecs } from './buckets.js';
import { estimateLambda } from './lambda.js';

// How far back each graph range goes, and how wide each averaged point is
const RANGES = {
  '1h': { hours: 1, bucketSecs: 60 },  // matches the sensor's 1-minute upload interval
  '24h': { hours: 24, bucketSecs: 5 * 60 },
  '3d': { hours: 72, bucketSecs: 15 * 60 },
} as const;

const deviceId = z.string().uuid();
const readingsQuery = z.object({ device: deviceId, range: z.enum(['1h', '24h', '3d']) });
const summaryQuery = z.object({ device: deviceId });
const windowQuery = z
  .object({ device: deviceId, from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to));
const WINDOW_HELP = 'Expected ?device=<uuid>&from=<ISO time>&to=<ISO time>, with from before to';

// Postgres numeric/bigint values can arrive as strings; null means "no data"
function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function dbError(res: Response, error: { message: string }): void {
  console.error('Supabase error:', error.message);
  res.status(502).json({ error: 'Database request failed' });
}

export const router = Router();

router.get('/devices', async (_req, res) => {
  const { data, error } = await supabase
    .from('devices')
    .select('device_id, last_seen, readings')
    .order('last_seen', { ascending: false });
  if (error) {
    dbError(res, error);
    return;
  }
  res.json(
    data.map((d) => ({ deviceId: d.device_id, lastSeen: d.last_seen, readings: Number(d.readings) })),
  );
});

router.get('/readings', async (req, res) => {
  const parsed = readingsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected ?device=<uuid>&range=1h|24h|3d' });
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

router.get('/summary', async (req, res) => {
  const parsed = summaryQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected ?device=<uuid>' });
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

// Data Analysis tab: graph points for any chosen window, bucketed to a few hundred points
router.get('/history/readings', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: WINDOW_HELP });
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

// Data Analysis tab: mean / median / low / high per measurement over the chosen window
router.get('/history/stats', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: WINDOW_HELP });
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

// Room air-change rate λ, learned from how CO2 decays while the room is empty.
// Looks back at least LAMBDA_MIN_LOOKBACK (one day rarely has enough decays), at most LAMBDA_MAX_LOOKBACK.
const LAMBDA_BUCKET_SECS = 5 * 60;
const LAMBDA_MIN_LOOKBACK_MS = 7 * 24 * 3600 * 1000;
const LAMBDA_MAX_LOOKBACK_MS = 60 * 24 * 3600 * 1000;
const PAGE_ROWS = 1000; // Supabase's default maximum rows per request

router.get('/history/lambda', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: WINDOW_HELP });
    return;
  }
  const { device } = parsed.data;
  const to = Date.parse(parsed.data.to);
  const span = Math.min(Math.max(to - Date.parse(parsed.data.from), LAMBDA_MIN_LOOKBACK_MS), LAMBDA_MAX_LOOKBACK_MS);
  const from = to - span;

  const points: { t: number; ppm: number }[] = [];
  for (let offset = 0; ; offset += PAGE_ROWS) {
    const { data, error } = await supabase
      .rpc('get_readings_between', {
        p_device: device,
        p_from: new Date(from).toISOString(),
        p_to: new Date(to).toISOString(),
        p_bucket_secs: LAMBDA_BUCKET_SECS,
      })
      .range(offset, offset + PAGE_ROWS - 1);
    if (error) {
      dbError(res, error);
      return;
    }
    const page = data as { t: string; ppm: unknown }[];
    for (const p of page) {
      const ppm = num(p.ppm);
      if (ppm !== null) points.push({ t: Date.parse(p.t), ppm });
    }
    if (page.length < PAGE_ROWS) break;
  }

  const est = estimateLambda(points);
  res.json({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    baselinePpm: est.baselinePpm,
    lambdaPerHour: est.lambdaPerHour,
    halfLifeHours: est.halfLifeHours,
    samples: est.samples,
    decays: est.decays.map((d) => ({
      ...d,
      start: new Date(d.start).toISOString(),
      end: new Date(d.end).toISOString(),
    })),
  });
});
