import 'server-only';
import { db } from './db';

export type RetentionSweepResult = {
  auditLogsDeleted: number;
  atsAnalysesDeleted: number;
  offersDeleted: number;
  verificationTokensDeleted: number;
  resetTokensDeleted: number;
  oauthAuthorizationsDeleted: number;
  aiProposalsExpired: number;
  aiProposalsDeleted: number;
};

export async function runRetentionSweep(): Promise<RetentionSweepResult> {
  const rows = await db()<
    Array<{
      auditLogsDeleted: number;
      atsAnalysesDeleted: number;
      offersDeleted: number;
      verificationTokensDeleted: number;
      resetTokensDeleted: number;
      oauthAuthorizationsDeleted: number;
      aiProposalsExpired: number;
      aiProposalsDeleted: number;
    }>
  >`select
      audit_logs_deleted as "auditLogsDeleted",
      ats_analyses_deleted as "atsAnalysesDeleted",
      offers_deleted as "offersDeleted",
      verification_tokens_deleted as "verificationTokensDeleted",
      reset_tokens_deleted as "resetTokensDeleted",
      oauth_authorizations_deleted as "oauthAuthorizationsDeleted",
      ai_proposals_expired as "aiProposalsExpired",
      ai_proposals_deleted as "aiProposalsDeleted"
    from run_retention_sweep()`;
  return rows[0];
}
