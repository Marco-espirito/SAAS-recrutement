import { describe, expect, it } from 'vitest';
import {
  calculateAvailableAt,
  matchesConditions,
  retryDelayMinutes,
} from '@/lib/domain/automation';

describe('automation conditions', () => {
  it('matches nested fields and numeric thresholds', () => {
    expect(
      matchesConditions(
        [
          { field: 'job.city', operator: 'equals', value: 'Lyon' },
          { field: 'job.match', operator: 'greater_than', value: 80 },
          { field: 'job.title', operator: 'contains', value: 'analyst' },
        ],
        { job: { city: 'Lyon', match: 92, title: 'Data Analyst' } },
      ),
    ).toBe(true);
  });

  it('rejects an event when one condition fails', () => {
    expect(
      matchesConditions(
        [
          { field: 'stage', operator: 'equals', value: 'SENT' },
          { field: 'answered', operator: 'not_equals', value: true },
        ],
        { stage: 'INTERVIEW', answered: false },
      ),
    ).toBe(false);
  });

  it('calculates a deterministic delay', () => {
    expect(
      calculateAvailableAt(new Date('2026-09-21T10:00:00Z'), 7).toISOString(),
    ).toBe('2026-09-28T10:00:00.000Z');
  });

  it('applies backoff and stops after three attempts', () => {
    expect(retryDelayMinutes(1)).toBe(2);
    expect(retryDelayMinutes(2)).toBe(4);
    expect(retryDelayMinutes(3)).toBeNull();
  });
});
