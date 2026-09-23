import { describe, expect, it } from 'vitest';
import { cutoffDate, defaultRetentionPolicy } from '@/lib/domain/retention';

describe('retention cutoff', () => {
  it('subtracts whole days in UTC', () => {
    expect(
      cutoffDate(new Date('2026-09-23T10:00:00Z'), 365).toISOString(),
    ).toBe('2025-09-23T10:00:00.000Z');
  });

  it('handles a zero-day policy as now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(cutoffDate(now, 0).toISOString()).toBe(now.toISOString());
  });

  it('exposes positive day counts for every policy field', () => {
    for (const value of Object.values(defaultRetentionPolicy)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
