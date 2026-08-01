ALTER TABLE acct_ctrl.outbox_events
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_letter_event_id UUID;

UPDATE acct_ctrl.outbox_events o SET organization_id = d.organization_id
FROM acct_ctrl.domain_events d WHERE o.domain_event_id = d.id AND o.organization_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.outbox_events WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'outbox_events memiliki tenant yang tidak dapat ditentukan';
  END IF;
END $$;

ALTER TABLE acct_ctrl.outbox_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE acct_ctrl.outbox_events ADD CONSTRAINT outbox_events_organization_fk FOREIGN KEY (organization_id) REFERENCES acct_ctrl.organizations(id);

ALTER TABLE acct_ctrl.dead_letter_events
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS outbox_event_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS replayed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replayed_by UUID;

UPDATE acct_ctrl.dead_letter_events d SET organization_id = (d.payload ->> 'organization_id')::uuid
WHERE d.organization_id IS NULL AND NULLIF(d.payload ->> 'organization_id', '') IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.dead_letter_events WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'dead_letter_events memiliki tenant yang tidak dapat ditentukan';
  END IF;
END $$;

ALTER TABLE acct_ctrl.dead_letter_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE acct_ctrl.dead_letter_events
  ADD CONSTRAINT dead_letter_events_organization_fk FOREIGN KEY (organization_id) REFERENCES acct_ctrl.organizations(id),
  ADD CONSTRAINT dead_letter_events_status_check CHECK (status IN ('pending', 'replayed', 'discarded')),
  ADD CONSTRAINT dead_letter_events_outbox_fk FOREIGN KEY (outbox_event_id) REFERENCES acct_ctrl.outbox_events(id);

CREATE INDEX IF NOT EXISTS idx_outbox_claimable ON acct_ctrl.outbox_events(status, next_retry_at, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_org_status ON acct_ctrl.dead_letter_events(organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION acct_ctrl.recover_expired_outbox_events(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH expired AS (
    SELECT id FROM acct_ctrl.outbox_events WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT GREATEST(p_limit, 1)
  )
  UPDATE acct_ctrl.outbox_events o SET status = 'pending', claimed_at = NULL, claimed_by = NULL, claim_token = NULL, lease_expires_at = NULL, next_retry_at = now()
  FROM expired WHERE o.id = expired.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF acct_ctrl.outbox_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (p_worker_id NOT LIKE 'notification-%' AND p_worker_id NOT LIKE 'ai-extraction-%') THEN
    RAISE EXCEPTION 'Worker tidak terotorisasi';
  END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type IS DISTINCT FROM 'ai_extraction_requested' THEN
    RAISE EXCEPTION 'AI worker hanya dapat claim ai_extraction_requested';
  END IF;
  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN
    RAISE EXCEPTION 'Notification worker hanya dapat claim event notification';
  END IF;
  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row FROM acct_ctrl.outbox_events o
  WHERE o.status = 'pending'
    AND (
      (p_event_type = 'notification' AND o.event_type IN ('item_assigned', 'status_changed', 'comment_added', 'deadline_approaching', 'item_overdue', 'item_escalated', 'review_requested', 'review_approved', 'digest'))
      OR (p_event_type IS NOT NULL AND p_event_type <> 'notification' AND o.event_type = p_event_type)
    )
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id,
    claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30))
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION acct_ctrl.fail_outbox_event(p_outbox_event_id UUID, p_error_message TEXT, p_worker_id TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE; v_dead_id UUID; v_retry INTEGER;
BEGIN
  SELECT * INTO v_row FROM acct_ctrl.outbox_events WHERE id = p_outbox_event_id AND status = 'processing' AND (p_worker_id IS NULL OR claimed_by = p_worker_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_retry := v_row.retry_count + 1;
  IF v_retry >= v_row.max_retries THEN
    INSERT INTO acct_ctrl.dead_letter_events (organization_id, outbox_event_id, event_type, payload, error_message, last_error, retry_count, last_retry_at)
    VALUES (v_row.organization_id, v_row.id, v_row.event_type, jsonb_build_object('outbox_id', v_row.id, 'organization_id', v_row.organization_id, 'payload', v_row.payload), p_error_message, p_error_message, v_retry, now())
    RETURNING id INTO v_dead_id;
    UPDATE acct_ctrl.outbox_events SET status = 'failed', retry_count = v_retry, last_error = p_error_message, dead_letter_event_id = v_dead_id, lease_expires_at = NULL, claimed_at = NULL, claimed_by = NULL, claim_token = NULL WHERE id = v_row.id;
  ELSE
    UPDATE acct_ctrl.outbox_events SET status = 'pending', retry_count = v_retry, last_error = p_error_message,
      next_retry_at = now() + make_interval(secs => LEAST(28800, 30 * power(2, v_retry - 1)::INTEGER)), lease_expires_at = NULL, claimed_at = NULL, claimed_by = NULL, claim_token = NULL WHERE id = v_row.id;
  END IF;
  RETURN v_dead_id;
END $$;

CREATE OR REPLACE FUNCTION acct_ctrl.replay_dead_letter_event(p_dead_letter_id UUID, p_actor_id UUID)
RETURNS acct_ctrl.outbox_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
DECLARE v_dead acct_ctrl.dead_letter_events%ROWTYPE; v_outbox acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  SELECT d.* INTO v_dead
  FROM acct_ctrl.dead_letter_events d
  WHERE d.id = p_dead_letter_id
    AND d.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM acct_ctrl.memberships m
      WHERE m.profile_id = p_actor_id AND m.organization_id = d.organization_id AND m.client_id IS NULL AND m.is_active
    )
  FOR UPDATE;
  IF NOT FOUND OR v_dead.outbox_event_id IS NULL THEN RAISE EXCEPTION 'Dead-letter event tidak tersedia untuk replay'; END IF;
  UPDATE acct_ctrl.outbox_events SET status = 'pending', next_retry_at = now(), last_error = NULL, lease_expires_at = NULL, claimed_at = NULL, claimed_by = NULL, claim_token = NULL WHERE id = v_dead.outbox_event_id RETURNING * INTO v_outbox;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbox event tidak ditemukan'; END IF;
  UPDATE acct_ctrl.dead_letter_events SET status = 'replayed', replayed_at = now(), replayed_by = p_actor_id, last_retry_at = now(), retry_count = retry_count + 1 WHERE id = v_dead.id;
  RETURN v_outbox;
END $$;

CREATE OR REPLACE FUNCTION acct_ctrl.prevent_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
BEGIN RAISE EXCEPTION 'audit_logs bersifat append-only'; END $$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON acct_ctrl.audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON acct_ctrl.audit_logs FOR EACH ROW EXECUTE FUNCTION acct_ctrl.prevent_audit_log_mutation();
REVOKE UPDATE, DELETE ON acct_ctrl.audit_logs FROM anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.recover_expired_outbox_events(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.fail_outbox_event(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.replay_dead_letter_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.recover_expired_outbox_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.fail_outbox_event(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.replay_dead_letter_event(UUID, UUID) TO service_role;
