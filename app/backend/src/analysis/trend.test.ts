import { describe, expect, it } from 'vitest';
import { classifyTrend } from './trend.js';

describe('classifyTrend', () => {
  it('needs enough readings', () => {
    expect(classifyTrend(500, 0)).toBe('insufficient');
    expect(classifyTrend(500, 2)).toBe('insufficient');
    expect(classifyTrend(null, 100)).toBe('insufficient');
    expect(classifyTrend(Number.NaN, 100)).toBe('insufficient');
  });

  it('detects rising and falling CO2', () => {
    expect(classifyTrend(120, 60)).toBe('rising');
    expect(classifyTrend(30, 60)).toBe('rising');
    expect(classifyTrend(-120, 60)).toBe('falling');
    expect(classifyTrend(-30, 60)).toBe('falling');
  });

  it('treats small changes as steady', () => {
    expect(classifyTrend(0, 60)).toBe('steady');
    expect(classifyTrend(29.9, 60)).toBe('steady');
    expect(classifyTrend(-29.9, 60)).toBe('steady');
  });
});
