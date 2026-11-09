// Types and fetch helpers for the backend API (app/backend/src/routes.ts)

import type { Metric } from './metrics';

export type Range = '1h' | '24h' | '3d';
export type TrendDirection = 'rising' | 'falling' | 'steady' | 'insufficient';

export interface Device {
  deviceId: string;
  lastSeen: string;
  readings: number;
}

export interface Point {
  t: string;
  ppm: number | null;
  tempC: number | null; // null for readings uploaded before temperature was added
  rhPct: number | null;
}

export interface ReadingsResponse {
  range: Range;
  since: string;
  bucketSecs: number;
  points: Point[];
}

export interface MetricStats {
  mean: number | null;
  median: number | null;
  high: number | null;
  highAt: string | null;
  count: number;
}

export interface Summary {
  last24h: Record<Metric, MetricStats>;
  latestTempC: number | null;
  latestRhPct: number | null;
  lastHour: {
    slopePpmPerHour: number | null;
    direction: TrendDirection;
    first: number | null;
    latest: number | null;
    count: number;
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Body wasn't JSON (e.g. the backend isn't running); keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const fetchDevices = () => getJson<Device[]>('/api/devices');

export const fetchReadings = (device: string, range: Range) =>
  getJson<ReadingsResponse>(`/api/readings?device=${encodeURIComponent(device)}&range=${range}`);

export const fetchSummary = (device: string) =>
  getJson<Summary>(`/api/summary?device=${encodeURIComponent(device)}`);
