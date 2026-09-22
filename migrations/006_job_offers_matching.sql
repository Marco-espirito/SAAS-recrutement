CREATE TABLE IF NOT EXISTS job_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text,
  query_key text NOT NULL,
  dedup_key text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  salary text,
  url text,
  skills text[] NOT NULL DEFAULT '{}',
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  expires_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS job_offers_status_idx
  ON job_offers (organization_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS job_offers_query_idx
  ON job_offers (organization_id, source, query_key, status);

CREATE TABLE IF NOT EXISTS candidate_offer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  data_complete boolean NOT NULL DEFAULT true,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_skills text[] NOT NULL DEFAULT '{}',
  missing_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback text CHECK (feedback IN ('RELEVANT', 'NOT_RELEVANT', 'APPLIED')),
  feedback_at timestamptz,
  feedback_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, profile_id, offer_id)
);
CREATE INDEX IF NOT EXISTS candidate_offer_matches_profile_idx
  ON candidate_offer_matches (organization_id, profile_id, score DESC);

ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_offer_matches ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'job_offers',
    'candidate_offer_matches'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;
