import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from './supabase.js';
import { classifyTrend } from './trend.js';
import { pickBucketSecs } from './buckets.js';
import { estimateLambda, type SeriesPoint } from './lambda.js';
import { bucketGest, computeGest } from './gest.js';

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

// Room model for the Data Analysis tab:
//  - λ (room air-change rate), learned from how CO2 decays while the room is empty. Looks back at least
//    ROOM_MIN_LOOKBACK, since one day rarely has enough empty periods, and at most ROOM_MAX_LOOKBACK.
//  - G_est over the chosen window: how fast the people in the room are pushing CO2 up, using that λ.
const ROOM_BUCKET_SECS = 5 * 60;
const ROOM_MIN_LOOKBACK_MS = 7 * 24 * 3600 * 1000;
const ROOM_MAX_LOOKBACK_MS = 60 * 24 * 3600 * 1000;
const PAGE_ROWS = 1000; // Supabase's default maximum rows per request

// CO2 averaged into ROOM_BUCKET_SECS buckets starting at `from`, paging past Supabase's row limit
async function fetchCo2Series(
  device: string,
  from: number,
  to: number,
): Promise<{ points: SeriesPoint[] } | { error: { message: string } }> {
  const points: SeriesPoint[] = [];
  for (let offset = 0; ; offset += PAGE_ROWS) {
    const { data, error } = await supabase
      .rpc('get_readings_between', {
        p_device: device,
        p_from: new Date(from).toISOString(),
        p_to: new Date(to).toISOString(),
        p_bucket_secs: ROOM_BUCKET_SECS,
      })
      .range(offset, offset + PAGE_ROWS - 1);
    if (error) return { error };
    const page = data as { t: string; ppm: unknown }[];
    for (const p of page) {
      const ppm = num(p.ppm);
      if (ppm !== null) points.push({ t: Date.parse(p.t), ppm });
    }
    if (page.length < PAGE_ROWS) return { points };
  }
}

router.get('/history/room-model', async (req, res) => {
  const parsed = windowQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: WINDOW_HELP });
    return;
  }
  const { device } = parsed.data;
  const windowFrom = Date.parse(parsed.data.from);
  const to = Date.parse(parsed.data.to);

  // Reach back to at least ROOM_MIN_LOOKBACK before `to`, in whole buckets so the 5-minute grid lines
  // up with the graph's points (binned from the window start). Never more than ROOM_MAX_LOOKBACK.
  const bucketMs = ROOM_BUCKET_SECS * 1000;
  const extraMs = Math.max(0, ROOM_MIN_LOOKBACK_MS - (to - windowFrom));
  const from = Math.max(windowFrom - Math.ceil(extraMs / bucketMs) * bucketMs, to - ROOM_MAX_LOOKBACK_MS);

  const result = await fetchCo2Series(device, from, to);
  if ('error' in result) {
    dbError(res, result.error);
    return;
  }
  const { points } = result;
  const est = estimateLambda(points);

  // G_est over the window (plus 10 minutes either side so the slope fit has data at the edges),
  // averaged to the same point width as the graph
  const graphBucketMs = Math.max(pickBucketSecs((to - windowFrom) / 1000) * 1000, bucketMs);
  const gest =
    est.lambdaPerHour === null || est.baselinePpm === null
      ? []
      : bucketGest(
          computeGest(
            points.filter((p) => p.t >= windowFrom - 10 * 60_000),
            est.lambdaPerHour,
            est.baselinePpm,
          ),
          windowFrom,
          graphBucketMs,
        );

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
    gest: {
      bucketSecs: graphBucketMs / 1000,
      points: gest.map((p) => ({ t: new Date(p.t).toISOString(), g: p.g === null ? null : Math.round(p.g) })),
    },
  });
});
