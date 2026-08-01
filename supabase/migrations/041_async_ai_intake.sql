ALTER TABLE acct_ctrl.ai_intake_items
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extraction_version TEXT NOT NULL DEFAULT 'task-extraction-v1';

CREATE INDEX IF NOT EXISTS idx_ai_intake_queue ON acct_ctrl.ai_intake_items(organization_id, status, queued_at, created_at);

CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_ai_intake(p_intake_id UUID, p_organization_id UUID, p_created_by UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE intake acct_ctrl.ai_intake_items%ROWTYPE; event_id UUID; outbox_id UUID;
BEGIN
  SELECT * INTO intake FROM acct_ctrl.ai_intake_items WHERE id = p_intake_id AND organization_id = p_organization_id AND created_by = p_created_by AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI intake tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF intake.status NOT IN ('pending','failed') THEN RETURN jsonb_build_object('intake_id', intake.id, 'status', intake.status); END IF;
  UPDATE acct_ctrl.ai_intake_items SET status = 'queued', queued_at = now(), failed_at = NULL, error_message = NULL, updated_at = now() WHERE id = intake.id;
  INSERT INTO acct_ctrl.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES (p_organization_id, 'ai_intake_requested', 'ai_intake', intake.id, jsonb_build_object('intake_id', intake.id, 'organization_id', p_organization_id, 'created_by', p_created_by)) RETURNING id INTO event_id;
  INSERT INTO acct_ctrl.outbox_events(organization_id, domain_event_id, event_type, payload, max_retries) VALUES (p_organization_id, event_id, 'ai_intake_requested', jsonb_build_object('intake_id', intake.id, 'organization_id', p_organization_id), 5) RETURNING id INTO outbox_id;
  RETURN jsonb_build_object('intake_id', intake.id, 'status', 'queued', 'outbox_id', outbox_id);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_ai_intake(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_ai_intake(UUID,UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF acct_ctrl.outbox_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, public AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (p_worker_id NOT LIKE 'notification-%' AND p_worker_id NOT LIKE 'ai-extraction-%' AND p_worker_id NOT LIKE 'file-scan-%') THEN RAISE EXCEPTION 'Worker tidak terotorisasi'; END IF;
  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN RAISE EXCEPTION 'Notification worker hanya dapat claim event notification'; END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type NOT IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested', 'ai_intake_requested') THEN RAISE EXCEPTION 'AI worker hanya dapat claim event AI'; END IF;
  IF p_worker_id LIKE 'file-scan-%' AND p_event_type IS DISTINCT FROM 'file_scan_requested' THEN RAISE EXCEPTION 'File-scan worker hanya dapat claim event file_scan_requested'; END IF;
  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row FROM acct_ctrl.outbox_events o WHERE o.status = 'pending' AND ((p_event_type = 'notification' AND o.event_type IN ('item_assigned','status_changed','comment_added','deadline_approaching','item_overdue','item_escalated','review_requested','review_approved','digest')) OR (p_event_type IN ('whatsapp_message_received','whatsapp_reply_requested','ai_extraction_requested','ai_intake_requested') AND o.event_type = p_event_type) OR (p_event_type = 'file_scan_requested' AND o.event_type = 'file_scan_requested')) AND (o.next_retry_at IS NULL OR o.next_retry_at <= now()) ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events SET status='processing', claimed_at=now(), claimed_by=p_worker_id, claim_token=gen_random_uuid(), lease_expires_at=now()+make_interval(secs=>GREATEST(p_lease_seconds,30)) WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT,TEXT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT,TEXT,INTEGER) TO service_role;
