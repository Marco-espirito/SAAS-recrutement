export const planKeys = ['FREE', 'STARTER', 'PRO'] as const;
export type PlanKey = (typeof planKeys)[number];

export type PlanLimits = {
  seats: number;
  aiRequestsPerMonth: number;
};

/**
 * Adjust freely — these are defaults, not Stripe-derived truth. The actual
 * price and Stripe Price ID live in env vars (STRIPE_PRICE_STARTER,
 * STRIPE_PRICE_PRO) since they depend on the Stripe account that owns them.
 */
export const planLimits: Record<PlanKey, PlanLimits> = {
  FREE: { seats: 2, aiRequestsPerMonth: 20 },
  STARTER: { seats: 10, aiRequestsPerMonth: 300 },
  PRO: { seats: 50, aiRequestsPerMonth: 2_000 },
};

/** Subscription statuses Stripe reports that still grant plan access. */
const usableSubscriptionStatuses = new Set(['active', 'trialing']);

export function isSubscriptionUsable(status: string | null): boolean {
  return status !== null && usableSubscriptionStatuses.has(status);
}

export function isTrialActive(trialEndsAt: Date | null, now: Date): boolean {
  return trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();
}

export function remainingQuota(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

export function quotaExceeded(used: number, limit: number): boolean {
  return used >= limit;
}

export function trialEndDate(startedAt: Date, trialDays: number): Date {
  const result = new Date(startedAt);
  result.setUTCDate(result.getUTCDate() + trialDays);
  return result;
}
