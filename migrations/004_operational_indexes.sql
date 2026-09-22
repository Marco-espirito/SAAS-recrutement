CREATE INDEX IF NOT EXISTS memberships_user_idx
  ON memberships (user_id, created_at);

CREATE INDEX IF NOT EXISTS tasks_org_status_due_idx
  ON tasks (organization_id, status, due_at);

CREATE INDEX IF NOT EXISTS interviews_org_starts_idx
  ON interviews (organization_id, starts_at);

CREATE INDEX IF NOT EXISTS documents_org_created_idx
  ON documents (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_proposals_pending_idx
  ON ai_action_proposals (organization_id, user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS automation_runs_org_created_idx
  ON automation_runs (organization_id, created_at DESC);
