CREATE TABLE IF NOT EXISTS user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EXTERNAL_AI_PROCESSING')),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('GRANTED', 'REVOKED')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_consents_lookup_idx
  ON user_consents (organization_id, user_id, type, created_at DESC);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON user_consents;
CREATE POLICY tenant_isolation ON user_consents
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- Exécuté par un rôle de maintenance périodique (worker, cron) : purge et anonymisation
-- selon les durées de conservation documentées dans docs/GDPR.md. SECURITY DEFINER
-- pour agir à travers toutes les organisations, à l'image de resolve_invitation_organization ;
-- le propriétaire de la fonction (rôle migrateur) n'est pas soumis aux politiques RLS
-- des tables qu'il possède, contrairement au rôle applicatif au moment de l'exécution normale.
CREATE OR REPLACE FUNCTION run_retention_sweep(p_now timestamptz DEFAULT now())
RETURNS TABLE (
  audit_logs_deleted bigint,
  ats_analyses_deleted bigint,
  offers_deleted bigint,
  verification_tokens_deleted bigint,
  reset_tokens_deleted bigint,
  oauth_authorizations_deleted bigint,
  ai_proposals_expired bigint,
  ai_proposals_deleted bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit bigint;
  v_ats bigint;
  v_offers bigint;
  v_verif bigint;
  v_reset bigint;
  v_oauth bigint;
  v_expired bigint;
  v_deleted bigint;
BEGIN
  DELETE FROM audit_logs WHERE created_at < p_now - interval '365 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  DELETE FROM candidate_ats_analyses WHERE created_at < p_now - interval '730 days';
  GET DIAGNOSTICS v_ats = ROW_COUNT;

  DELETE FROM job_offers WHERE status IN ('EXPIRED', 'REMOVED') AND updated_at < p_now - interval '365 days';
  GET DIAGNOSTICS v_offers = ROW_COUNT;

  DELETE FROM email_verification_tokens WHERE expires_at < p_now;
  GET DIAGNOSTICS v_verif = ROW_COUNT;

  DELETE FROM password_reset_tokens WHERE expires_at < p_now;
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  DELETE FROM oauth_authorizations WHERE expires_at < p_now - interval '1 day';
  GET DIAGNOSTICS v_oauth = ROW_COUNT;

  UPDATE ai_action_proposals SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at < p_now;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  DELETE FROM ai_action_proposals
    WHERE status IN ('EXPIRED', 'REJECTED', 'EXECUTED', 'FAILED') AND created_at < p_now - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_audit, v_ats, v_offers, v_verif, v_reset, v_oauth, v_expired, v_deleted;
END;
$$;
