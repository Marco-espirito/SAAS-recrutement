ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS automation_runs_lease_idx
  ON automation_runs (status, locked_at)
  WHERE status = 'RUNNING';
