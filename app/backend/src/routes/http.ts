// Request validation and error responses shared by the route files

import type { Response } from 'express';
import { z } from 'zod';

export const deviceId = z.string().uuid();

// A chosen time window, as used by the Data Analysis tab
export const windowQuery = z
  .object({ device: deviceId, from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to));

export const WINDOW_HELP = 'Expected ?device=<uuid>&from=<ISO time>&to=<ISO time>, with from before to';

export function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

export function dbError(res: Response, error: { message: string }): void {
  console.error('Supabase error:', error.message);
  res.status(502).json({ error: 'Database request failed' });
}
