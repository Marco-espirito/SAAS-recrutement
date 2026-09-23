export type RetentionPolicy = {
  auditLogsDays: number;
  atsAnalysesDays: number;
  expiredOffersDays: number;
  unusedOAuthChallengesDays: number;
  aiProposalsDays: number;
};

/**
 * Defaults documented in docs/GDPR.md — adjust there and here together.
 * Short-lived tokens (session, email verification, password reset) are
 * cleaned up on their own expiry, not listed as a retention policy.
 */
export const defaultRetentionPolicy: RetentionPolicy = {
  auditLogsDays: 365,
  atsAnalysesDays: 730,
  expiredOffersDays: 365,
  unusedOAuthChallengesDays: 1,
  aiProposalsDays: 90,
};

export function cutoffDate(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
