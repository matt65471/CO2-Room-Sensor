import { describe, expect, it } from 'vitest';
import { MAX_POINTS, pickBucketSecs } from '../../src/analysis/buckets.js';

describe('pickBucketSecs', () => {
  it('uses 1-minute buckets for short windows', () => {
    expect(pickBucketSecs(60)).toBe(60);
    expect(pickBucketSecs(3600)).toBe(60);
  });

  it('picks the smallest tidy bucket that keeps the point count in bounds', () => {
    expect(pickBucketSecs(24 * 3600)).toBe(5 * 60); // 288 points
    expect(pickBucketSecs(7 * 24 * 3600)).toBe(30 * 60); // 336 points
    expect(pickBucketSecs(30 * 24 * 3600)).toBe(2 * 3600); // 360 points
  });

  it('never exceeds the point budget', () => {
    for (const days of [1, 2, 3, 10, 45, 90, 365, 1000]) {
      const span = days * 86400;
      expect(span / pickBucketSecs(span)).toBeLessThanOrEqual(MAX_POINTS);
    }
  });
});
