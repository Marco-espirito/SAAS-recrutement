import { describe, expect, it } from 'vitest';
import { automationPreviewInput } from '@/lib/domain/automation-schema';
import {
  calculateAvailableAt,
  matchesConditions,
  isAutomationCondition,
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

  it('supports nested AND/OR groups and validates their shape', () => {
    const tree = {
      operator: 'any' as const,
      conditions: [
        { field: 'stage', operator: 'equals' as const, value: 'SENT' },
        {
          operator: 'all' as const,
          conditions: [
            { field: 'stage', operator: 'equals' as const, value: 'INTERVIEW' },
            { field: 'answered', operator: 'equals' as const, value: false },
          ],
        },
      ],
    };
    expect(isAutomationCondition(tree)).toBe(true);
    expect(
      matchesConditions([tree], { stage: 'INTERVIEW', answered: false }),
    ).toBe(true);
    expect(
      matchesConditions([tree], { stage: 'INTERVIEW', answered: true }),
    ).toBe(false);
    expect(isAutomationCondition({ operator: 'any', conditions: [] })).toBe(
      false,
    );
  });

  it('rejects an invalid preview before any workflow can be saved', () => {
    const valid = {
      name: 'Relance',
      triggerType: 'APPLICATION_STAGE_CHANGED',
      delayDays: 7,
      conditions: [
        {
          operator: 'any',
          conditions: [{ field: 'stage', operator: 'equals', value: 'SENT' }],
        },
      ],
      actions: [{ type: 'CREATE_TASK', title: 'Relancer', dueInDays: 0 }],
      payload: { stage: 'SENT' },
    };
    expect(automationPreviewInput.safeParse(valid).success).toBe(true);
    expect(
      automationPreviewInput.safeParse({
        ...valid,
        conditions: [{ operator: 'any', conditions: [] }],
      }).success,
    ).toBe(false);
    expect(
      automationPreviewInput.safeParse({
        ...valid,
        actions: [{ type: 'SEND_EMAIL', title: 'Relancer' }],
      }).success,
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
