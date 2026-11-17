// Reading CO2 series out of Supabase for the room model

import type { SeriesPoint } from '../roomModel/lambda.js';
import { num } from './rows.js';
import { supabase } from './supabase.js';

const PAGE_ROWS = 1000; // Supabase's default maximum rows per request

// CO2 averaged into `bucketSecs` buckets starting at `from` (ms), paging past Supabase's row limit
export async function fetchCo2Series(
  device: string,
  from: number,
  to: number,
  bucketSecs: number,
): Promise<{ points: SeriesPoint[] } | { error: { message: string } }> {
  const points: SeriesPoint[] = [];
  for (let offset = 0; ; offset += PAGE_ROWS) {
    const { data, error } = await supabase
      .rpc('get_readings_between', {
        p_device: device,
        p_from: new Date(from).toISOString(),
        p_to: new Date(to).toISOString(),
        p_bucket_secs: bucketSecs,
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
