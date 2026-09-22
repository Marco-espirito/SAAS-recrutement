ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'RECRUITER', 'CANDIDATE')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON organization_invitations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_invitations_expiry_idx
  ON organization_invitations (expires_at);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone text,
  location text,
  headline text,
  summary text,
  linkedin_url text,
  website_url text,
  desired_roles text[] NOT NULL DEFAULT '{}',
  desired_locations text[] NOT NULL DEFAULT '{}',
  remote_preference text NOT NULL DEFAULT 'FLEXIBLE'
    CHECK (remote_preference IN ('ONSITE', 'HYBRID', 'REMOTE', 'FLEXIBLE')),
  employment_types text[] NOT NULL DEFAULT '{}',
  salary_min integer CHECK (salary_min IS NULL OR salary_min >= 0),
  salary_max integer CHECK (salary_max IS NULL OR salary_max >= 0),
  availability_date date,
  skills text[] NOT NULL DEFAULT '{}',
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min)
);

CREATE TABLE IF NOT EXISTS candidate_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('WORK', 'EDUCATION', 'PROJECT')),
  title text NOT NULL,
  organization_name text,
  location text,
  description text,
  started_at date,
  ended_at date,
  current boolean NOT NULL DEFAULT false,
  skills text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS candidate_experiences_profile_idx
  ON candidate_experiences (organization_id, profile_id, position, started_at DESC);

CREATE TABLE IF NOT EXISTS candidate_ats_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  detected_keywords text[] NOT NULL DEFAULT '{}',
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_ats_analyses_user_idx
  ON candidate_ats_analyses (organization_id, user_id, created_at DESC);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_ats_analyses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_invitations',
    'candidate_profiles',
    'candidate_experiences',
    'candidate_ats_analyses'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION resolve_invitation_organization(p_token_hash text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM organization_invitations
  WHERE token_hash = p_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1
$$;
