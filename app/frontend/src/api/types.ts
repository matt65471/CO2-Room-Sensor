// Shapes of the backend API's responses (app/backend/src/routes/)

import type { Metric } from '../lib/metrics';

// ---- Sensor picker and Consumer Dashboard (routes/devices.ts, routes/dashboard.ts) ----

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
  low: number | null;
  lowAt: string | null;
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

// ---- Data Analysis: any chosen window (routes/history.ts) ----

export interface HistoryReadings {
  from: string;
  to: string;
  bucketSecs: number;
  points: Point[];
}

export type HistoryStats = { from: string; to: string } & Record<Metric, MetricStats>;

// ---- Data Analysis: room model (routes/roomModel.ts) ----

// Air-change rate λ, learned from empty-room CO2 decays (backend roomModel/lambda.ts)
export type DecayVerdict = 'empty' | 'ventilation' | 'settles-above-baseline' | 'inconclusive' | 'irregular';

export interface Decay {
  start: string;
  end: string;
  startPpm: number;
  endPpm: number;
  lambda: number;
  r2: number;
  settlesAt: number | null;
  verdict: DecayVerdict;
}

// Empty / active / asleep labels for G_est, thresholds learned from the data (backend roomModel/occupancy.ts)
export type OccupancyLabel = 'empty' | 'active' | 'asleep' | 'unknown';

export type OccupancyEventType = 'arrived' | 'left' | 'fell-asleep' | 'woke-up';

export interface Occupancy {
  model: {
    emptyBelow: number; // ppm/h
    emptyLearned: boolean;
    asleep: { level: number; steadiness: number } | null; // null: not enough data to learn sleep
    active: { level: number; steadiness: number } | null;
    notes: string[];
  };
  segments: { start: string; end: string; label: OccupancyLabel }[];
  events: { t: string; type: OccupancyEventType }[];
}

export interface RoomModel {
  // The data the room model learned from: at least 7 days, centred on the chosen window when the days
  // after it exist, otherwise the 7 days ending at the window's end
  from: string;
  to: string;
  centred: boolean;
  baselinePpm: number | null;
  lambdaPerHour: number | null;
  halfLifeHours: number | null;
  samples: number;
  decays: Decay[];
  gest: {
    bucketSecs: number;
    points: { t: string; g: number | null }[]; // ppm per hour
  };
  occupancy: Occupancy;
}
