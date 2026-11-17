import { describe, expect, it } from 'vitest';
import { chooseLookback } from '../../src/roomModel/lookback.js';

const DAY = 24 * 3600 * 1000;
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-11-17T12:00:00Z');

describe('chooseLookback', () => {
  it('centres a short past window when the days after it exist', () => {
    const lb = chooseLookback(at('2026-11-10T00:00:00Z'), at('2026-11-11T00:00:00Z'), NOW);
    expect(lb).toEqual({ from: at('2026-11-07T00:00:00Z'), to: at('2026-11-14T00:00:00Z'), centred: true });
  });

  it('falls back to the 7 days ending at the window when centring would need future data', () => {
    const lb = chooseLookback(NOW - DAY, NOW, NOW);
    expect(lb).toEqual({ from: NOW - 7 * DAY, to: NOW, centred: false });
  });

  it('uses a window of 7 to 60 days exactly', () => {
    const lb = chooseLookback(NOW - 20 * DAY, NOW, NOW);
    expect(lb).toEqual({ from: NOW - 20 * DAY, to: NOW, centred: false });
  });

  it('caps a longer window to its last 60 days', () => {
    const lb = chooseLookback(NOW - 90 * DAY, NOW, NOW);
    expect(lb).toEqual({ from: NOW - 60 * DAY, to: NOW, centred: false });
  });
});
