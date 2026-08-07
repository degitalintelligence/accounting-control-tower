-- Prevent archived organizations from producing or processing business automation.
-- File scanning and WhatsApp retention cleanup remain unaffected because this only
-- guards automation writes/claims, not retention deletes or file-scan rows.

CREATE OR REPLACE FUNCTION acct_ctrl.reject_archived_organization_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM acct_ctrl.organizations
    WHERE id = NEW.organization_id
      AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; automation tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_archived_work_items ON acct_ctrl.work_items;
CREATE TRIGGER trg_reject_archived_work_items
  BEFORE INSERT OR UPDATE ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.reject_archived_organization_automation();

DROP TRIGGER IF EXISTS trg_reject_archived_domain_events ON acct_ctrl.domain_events;
CREATE TRIGGER trg_reject_archived_domain_events
  BEFORE INSERT OR UPDATE ON acct_ctrl.domain_events
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.reject_archived_organization_automation();

DROP TRIGGER IF EXISTS trg_reject_archived_outbox_events ON acct_ctrl.outbox_events;
CREATE TRIGGER trg_reject_archived_outbox_events
  BEFORE INSERT OR UPDATE ON acct_ctrl.outbox_events
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.reject_archived_organization_automation();

DROP TRIGGER IF EXISTS trg_reject_archived_recurrence_job_runs ON acct_ctrl.recurrence_job_runs;
CREATE TRIGGER trg_reject_archived_recurrence_job_runs
  BEFORE INSERT OR UPDATE ON acct_ctrl.recurrence_job_runs
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.reject_archived_organization_automation();

CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF acct_ctrl.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (p_worker_id NOT LIKE 'notification-%' AND p_worker_id NOT LIKE 'ai-extraction-%' AND p_worker_id NOT LIKE 'file-scan-%' AND p_worker_id NOT LIKE 'whatsapp-summary-%') THEN RAISE EXCEPTION 'Worker tidak terotorisasi'; END IF;
  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN RAISE EXCEPTION 'Notification worker hanya dapat claim event notification'; END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type NOT IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested', 'ai_intake_requested') THEN RAISE EXCEPTION 'AI worker hanya dapat claim event AI'; END IF;
  IF p_worker_id LIKE 'whatsapp-summary-%' AND p_event_type IS DISTINCT FROM 'whatsapp_conversation_summary_requested' THEN RAISE EXCEPTION 'Summary worker hanya dapat claim event summary WhatsApp'; END IF;
  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row
  FROM acct_ctrl.outbox_events o
  JOIN acct_ctrl.organizations org ON org.id = o.organization_id AND org.deleted_at IS NULL
  WHERE o.status = 'pending'
    AND ((p_event_type = 'notification' AND o.event_type IN ('item_assigned','status_changed','comment_added','deadline_approaching','item_overdue','item_escalated','review_requested','review_approved','digest'))
      OR (p_event_type IN ('whatsapp_message_received','whatsapp_reply_requested','ai_extraction_requested','ai_intake_requested','whatsapp_conversation_summary_requested') AND o.event_type = p_event_type)
      OR (p_event_type = 'file_scan_requested' AND o.event_type = 'file_scan_requested'))
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id, claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)) WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.claim_ai_intake(
  p_intake_id UUID, p_organization_id UUID, p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 600
)
RETURNS SETOF acct_ctrl.ai_intake_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE acct_ctrl.ai_intake_items intake
  SET status = 'processing', processing_started_at = now(), attempt_count = COALESCE(attempt_count, 0) + 1,
      claimed_by = p_worker_id, claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)), updated_at = now()
  WHERE intake.id = p_intake_id AND intake.organization_id = p_organization_id
    AND intake.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM acct_ctrl.organizations org WHERE org.id = intake.organization_id AND org.deleted_at IS NULL)
    AND (intake.status = 'queued' OR (intake.status = 'processing' AND (intake.lease_expires_at IS NULL OR intake.lease_expires_at <= now())))
  RETURNING intake.*;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION acct_ctrl.claim_ai_intake(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_ai_intake(UUID, UUID, TEXT, INTEGER) TO service_role;
