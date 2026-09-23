CREATE TABLE IF NOT EXISTS oauth_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft', 'slack')),
  state_hash text NOT NULL UNIQUE,
  verifier_cipher text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_authorizations_expiry_idx ON oauth_authorizations (expires_at);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft', 'slack')),
  external_account_id text,
  display_name text,
  access_token_cipher text NOT NULL,
  refresh_token_cipher text,
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  sync_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  sync_lease_until timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, provider)
);
CREATE INDEX IF NOT EXISTS oauth_connections_due_idx ON oauth_connections (last_synced_at) WHERE disconnected_at IS NULL;

CREATE TABLE IF NOT EXISTS external_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'event', 'notification')),
  remote_id text NOT NULL,
  title text,
  summary text,
  occurred_at timestamptz,
  remote_updated_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, kind, remote_id)
);
CREATE INDEX IF NOT EXISTS external_items_org_idx ON external_items (organization_id, kind, occurred_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['oauth_authorizations', 'oauth_connections', 'external_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;
