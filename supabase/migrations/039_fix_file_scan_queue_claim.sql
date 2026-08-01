CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF acct_ctrl.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (p_worker_id NOT LIKE 'notification-%' AND p_worker_id NOT LIKE 'ai-extraction-%' AND p_worker_id NOT LIKE 'file-scan-%') THEN
    RAISE EXCEPTION 'Worker tidak terotorisasi';
  END IF;
  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN
    RAISE EXCEPTION 'Notification worker hanya dapat claim event notification';
  END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type NOT IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested') THEN
    RAISE EXCEPTION 'WhatsApp worker hanya dapat claim event WhatsApp';
  END IF;
  IF p_worker_id LIKE 'file-scan-%' AND p_event_type IS DISTINCT FROM 'file_scan_requested' THEN
    RAISE EXCEPTION 'File-scan worker hanya dapat claim event file_scan_requested';
  END IF;

  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row
  FROM acct_ctrl.outbox_events o
  WHERE o.status = 'pending'
    AND (
      (p_event_type = 'notification' AND o.event_type IN ('item_assigned', 'status_changed', 'comment_added', 'deadline_approaching', 'item_overdue', 'item_escalated', 'review_requested', 'review_approved', 'digest'))
      OR (p_event_type IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested') AND o.event_type = p_event_type)
      OR (p_event_type = 'file_scan_requested' AND o.event_type = 'file_scan_requested')
    )
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events
  SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id,
      claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30))
  WHERE id = v_row.id
  RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) TO service_role;
