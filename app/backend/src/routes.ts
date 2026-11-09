import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from './supabase.js';
import { classifyTrend } from './trend.js';

// How far back each graph range goes, and how wide each averaged point is
const RANGES = {
  '1h': { hours: 1, bucketSecs: 60 },  // matches the sensor's 1-minute upload interval
  '24h': { hours: 24, bucketSecs: 5 * 60 },
  '3d': { hours: 72, bucketSecs: 15 * 60 },
} as const;

const deviceId = z.string().uuid();
const readingsQuery = z.object({ device: deviceId, range: z.enum(['1h', '24h', '3d']) });
const summaryQuery = z.object({ device: deviceId });

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
