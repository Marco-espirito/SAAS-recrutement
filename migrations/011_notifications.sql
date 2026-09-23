CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('REMINDERS', 'PIPELINE', 'MENTIONS', 'DIGEST', 'SYSTEM')),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON notifications (organization_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON notifications (organization_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (organization_id, user_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('REMINDERS', 'PIPELINE', 'MENTIONS', 'DIGEST', 'SYSTEM')),
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  digest_frequency text NOT NULL DEFAULT 'NEVER' CHECK (digest_frequency IN ('NEVER', 'DAILY', 'WEEKLY')),
  last_digest_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, category)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['notifications', 'notification_preferences']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

-- Rappels programmés (entretiens à venir, tâches proches de leur échéance) : SECURITY DEFINER
-- pour agir à travers toutes les organisations, comme run_retention_sweep(). ON CONFLICT sur
-- dedup_key rend l'insertion idempotente : relancer la fonction ne duplique pas les rappels.
CREATE OR REPLACE FUNCTION generate_reminder_notifications(p_now timestamptz DEFAULT now())
RETURNS TABLE (task_reminders bigint, interview_reminders bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasks bigint;
  v_interviews bigint;
BEGIN
  INSERT INTO notifications (organization_id, user_id, category, type, title, body, dedup_key)
  SELECT t.organization_id, t.assignee_id, 'REMINDERS', 'TASK_DUE_SOON',
    'Tâche à échéance proche', t.title, 'task:' || t.id
  FROM tasks t
  WHERE t.assignee_id IS NOT NULL
    AND t.status IN ('TODO', 'IN_PROGRESS')
    AND t.due_at IS NOT NULL
    AND t.due_at BETWEEN p_now AND p_now + interval '24 hours'
  ON CONFLICT (organization_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  INSERT INTO notifications (organization_id, user_id, category, type, title, body, dedup_key)
  SELECT i.organization_id, c.owner_id, 'REMINDERS', 'INTERVIEW_SOON',
    'Entretien à venir', a.role_title, 'interview:' || i.id
  FROM interviews i
  JOIN applications a ON a.id = i.application_id
  JOIN companies c ON c.id = a.company_id
  WHERE i.status = 'SCHEDULED'
    AND c.owner_id IS NOT NULL
    AND i.starts_at BETWEEN p_now AND p_now + interval '24 hours'
  ON CONFLICT (organization_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_interviews = ROW_COUNT;

  RETURN QUERY SELECT v_tasks, v_interviews;
END;
$$;

-- Résumés périodiques : un seul récapitulatif par personne quand son échéance (quotidienne ou
-- hebdomadaire, opt-in via notification_preferences) est atteinte et qu'il y a du non-lu.
CREATE OR REPLACE FUNCTION generate_digest_notifications(p_now timestamptz DEFAULT now())
RETURNS TABLE (digests_sent bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint := 0;
  r RECORD;
  v_unread bigint;
BEGIN
  FOR r IN
    SELECT organization_id, user_id, digest_frequency, last_digest_at
    FROM notification_preferences
    WHERE category = 'DIGEST' AND digest_frequency <> 'NEVER'
      AND (
        last_digest_at IS NULL
        OR (digest_frequency = 'DAILY' AND last_digest_at < p_now - interval '1 day')
        OR (digest_frequency = 'WEEKLY' AND last_digest_at < p_now - interval '7 days')
      )
  LOOP
    SELECT count(*) INTO v_unread FROM notifications
      WHERE organization_id = r.organization_id AND user_id = r.user_id
        AND read_at IS NULL AND category <> 'DIGEST'
        AND created_at > coalesce(r.last_digest_at, p_now - interval '30 days');
    IF v_unread > 0 THEN
      INSERT INTO notifications (organization_id, user_id, category, type, title, body)
      VALUES (r.organization_id, r.user_id, 'DIGEST', 'PERIODIC_DIGEST',
        'Résumé de votre activité',
        v_unread || ' notification(s) non lue(s) depuis votre dernier résumé.');
      v_count := v_count + 1;
    END IF;
    UPDATE notification_preferences SET last_digest_at = p_now
      WHERE organization_id = r.organization_id AND user_id = r.user_id AND category = 'DIGEST';
  END LOOP;
  RETURN QUERY SELECT v_count;
END;
$$;
