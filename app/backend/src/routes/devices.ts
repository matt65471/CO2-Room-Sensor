// GET /devices: every sensor that has sent readings, most recently seen first

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { dbError } from './http.js';

export const devicesRouter = Router();

devicesRouter.get('/devices', async (_req, res) => {
  const { data, error } = await supabase
    .from('devices')
    .select('device_id, last_seen, readings')
    .order('last_seen', { ascending: false });
  if (error) {
    dbError(res, error);
    return;
  }
  res.json(data.map((d) => ({ deviceId: d.device_id, lastSeen: d.last_seen, readings: Number(d.readings) })));
});
