// Fetch helpers for the backend API (app/backend/src/routes/)

import type {
  Device,
  HistoryReadings,
  HistoryStats,
  Range,
  ReadingsResponse,
  RoomModel,
  Summary,
} from './types';

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

// Data Analysis tab: any chosen window
function windowParams(device: string, from: Date, to: Date): string {
  const q = new URLSearchParams({ device, from: from.toISOString(), to: to.toISOString() });
  return q.toString();
}

export const fetchHistoryReadings = (device: string, from: Date, to: Date) =>
  getJson<HistoryReadings>(`/api/history/readings?${windowParams(device, from, to)}`);

export const fetchHistoryStats = (device: string, from: Date, to: Date) =>
  getJson<HistoryStats>(`/api/history/stats?${windowParams(device, from, to)}`);

// λ, G_est and its empty / active / asleep labels for the chosen window
export const fetchRoomModel = (device: string, from: Date, to: Date) =>
  getJson<RoomModel>(`/api/history/room-model?${windowParams(device, from, to)}`);
