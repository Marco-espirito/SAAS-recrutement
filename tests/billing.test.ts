import { describe, expect, it } from 'vitest';
import {
  isSubscriptionUsable,
  isTrialActive,
  planLimits,
  quotaExceeded,
  remainingQuota,
  trialEndDate,
} from '@/lib/domain/billing';

describe('subscription usability', () => {
  it('treats active and trialing as usable', () => {
    expect(isSubscriptionUsable('active')).toBe(true);
    expect(isSubscriptionUsable('trialing')).toBe(true);
  });

  it('treats everything else, including null, as not usable', () => {
    expect(isSubscriptionUsable('past_due')).toBe(false);
    expect(isSubscriptionUsable('canceled')).toBe(false);
    expect(isSubscriptionUsable('unpaid')).toBe(false);
    expect(isSubscriptionUsable(null)).toBe(false);
  });
});

describe('trial window', () => {
  it('is active strictly before the end date', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    expect(isTrialActive(new Date('2026-01-16T00:00:00Z'), now)).toBe(true);
    expect(isTrialActive(new Date('2026-01-15T00:00:00Z'), now)).toBe(false);
    expect(isTrialActive(new Date('2026-01-14T00:00:00Z'), now)).toBe(false);
  });

  it('is never active without an end date', () => {
    expect(isTrialActive(null, new Date())).toBe(false);
  });

  it('computes the end date as whole days from the start', () => {
    expect(
      trialEndDate(new Date('2026-01-01T09:00:00Z'), 14).toISOString(),
    ).toBe('2026-01-15T09:00:00.000Z');
  });
});

describe('quota arithmetic', () => {
  it('never returns a negative remainder', () => {
    expect(remainingQuota(5, 20)).toBe(15);
    expect(remainingQuota(25, 20)).toBe(0);
  });

  it('flags exceeded exactly at the limit, not just past it', () => {
    expect(quotaExceeded(19, 20)).toBe(false);
    expect(quotaExceeded(20, 20)).toBe(true);
    expect(quotaExceeded(21, 20)).toBe(true);
  });
});

describe('plan limits', () => {
  it('increase seats and AI quota from FREE to STARTER to PRO', () => {
    expect(planLimits.FREE.seats).toBeLessThan(planLimits.STARTER.seats);
    expect(planLimits.STARTER.seats).toBeLessThan(planLimits.PRO.seats);
    expect(planLimits.FREE.aiRequestsPerMonth).toBeLessThan(
      planLimits.STARTER.aiRequestsPerMonth,
    );
    expect(planLimits.STARTER.aiRequestsPerMonth).toBeLessThan(
      planLimits.PRO.aiRequestsPerMonth,
    );
  });
});
