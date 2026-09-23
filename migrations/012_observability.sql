-- Aucune donnée métier : pas de organization_id, pas de RLS. Un seul jeu de
-- lignes système, une par service qui rapporte sa dernière exécution.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  service text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'OK' CHECK (last_status IN ('OK', 'ERROR')),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
