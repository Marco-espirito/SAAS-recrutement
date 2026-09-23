CREATE TABLE IF NOT EXISTS organization_billing (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'STARTER', 'PRO')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_billing_customer_idx
  ON organization_billing (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_org_period_idx
  ON ai_usage_events (organization_id, created_at DESC);

-- Ledger d'idempotence Stripe : un événement de webhook peut être livré plus
-- d'une fois (recommandation Stripe elle-même). Pas de organization_id — on
-- ne le connaît qu'après avoir lu la charge utile, donc pas de RLS ici.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON organization_billing;
CREATE POLICY tenant_isolation ON organization_billing
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON ai_usage_events;
CREATE POLICY tenant_isolation ON ai_usage_events
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- Le webhook Stripe (SECURITY DEFINER, comme run_retention_sweep) écrit en
-- dehors de tout contexte app.organization_id : il apprend quelle
-- organisation est concernée via stripe_customer_id, pas via la session.
CREATE OR REPLACE FUNCTION upsert_organization_billing(
  p_organization_id uuid,
  p_plan text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_subscription_status text,
  p_trial_ends_at timestamptz,
  p_current_period_end timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO organization_billing
    (organization_id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, current_period_end)
  VALUES
    (p_organization_id, p_plan, p_stripe_customer_id, p_stripe_subscription_id, p_subscription_status, p_trial_ends_at, p_current_period_end)
  ON CONFLICT (organization_id) DO UPDATE SET
    plan = excluded.plan,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, organization_billing.stripe_customer_id),
    stripe_subscription_id = excluded.stripe_subscription_id,
    subscription_status = excluded.subscription_status,
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end,
    updated_at = now();
$$;

CREATE OR REPLACE FUNCTION find_organization_by_stripe_customer(p_stripe_customer_id text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id FROM organization_billing WHERE stripe_customer_id = p_stripe_customer_id LIMIT 1;
$$;

-- Fait redescendre en FREE les organisations dont l'essai est terminé sans
-- abonnement Stripe actif. SECURITY DEFINER pour agir à travers toutes les
-- organisations, comme run_retention_sweep().
CREATE OR REPLACE FUNCTION expire_billing_trials(p_now timestamptz DEFAULT now())
RETURNS TABLE (downgraded bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  UPDATE organization_billing
    SET plan = 'FREE', updated_at = p_now
    WHERE trial_ends_at IS NOT NULL AND trial_ends_at < p_now
      AND plan <> 'FREE'
      AND subscription_status IS DISTINCT FROM 'active'
      AND subscription_status IS DISTINCT FROM 'trialing';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;
