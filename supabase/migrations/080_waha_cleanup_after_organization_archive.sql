CREATE OR REPLACE FUNCTION acct_ctrl.archive_organization(p_organization_id UUID)
RETURNS TABLE(organization_id UUID, archived_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_archived_at TIMESTAMPTZ := now();
  v_organization_updated BOOLEAN;
  v_event_id UUID;
  v_sessions JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships AS membership
    WHERE membership.profile_id = v_user_id
      AND membership.organization_id = p_organization_id
      AND membership.is_active = true
      AND membership.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM acct_ctrl.memberships
      WHERE organization_id = p_organization_id AND is_active = true AND role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'SOLE_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM acct_ctrl.organizations
    WHERE id = p_organization_id AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_ARCHIVED' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('connection_id', id, 'session_id', session_id)),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM acct_ctrl.integration_connections
  WHERE organization_id = p_organization_id
    AND provider = 'waha'
    AND session_id IS NOT NULL
    AND deleted_at IS NULL;

  INSERT INTO acct_ctrl.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, event_key, payload
  )
  VALUES (
    p_organization_id,
    'waha_session_cleanup_requested',
    'organization',
    p_organization_id,
    'organization.archive.waha_cleanup.' || p_organization_id::text,
    jsonb_build_object('organization_id', p_organization_id, 'sessions', v_sessions)
  )
  RETURNING id INTO v_event_id;

  INSERT INTO acct_ctrl.outbox_events (
    organization_id, domain_event_id, event_type, payload, max_retries
  )
  VALUES (
    p_organization_id, v_event_id, 'waha_session_cleanup_requested',
    jsonb_build_object('organization_id', p_organization_id, 'sessions', v_sessions), 12
  );

  UPDATE acct_ctrl.organizations
  SET deleted_at = coalesce(deleted_at, v_archived_at), updated_at = v_archived_at
  WHERE id = p_organization_id AND deleted_at IS NULL;
  v_organization_updated := FOUND;

  UPDATE acct_ctrl.integration_connections
  SET status = 'retired',
      retired_at = COALESCE(retired_at, v_archived_at),
      retired_by = COALESCE(retired_by, v_user_id),
      updated_at = v_archived_at
  WHERE organization_id = p_organization_id
    AND provider = 'waha'
    AND deleted_at IS NULL;

  IF NOT v_organization_updated THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_ARCHIVED' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO acct_ctrl.audit_logs (organization_id, actor_id, action, entity_type, entity_id, new_value)
  VALUES (p_organization_id, v_user_id, 'organization.archived', 'organization', p_organization_id,
          jsonb_build_object('archived_at', v_archived_at, 'data_retained', true));

  RETURN QUERY SELECT p_organization_id, v_archived_at;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(
  p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF acct_ctrl.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (
    p_worker_id NOT LIKE 'notification-%'
    AND p_worker_id NOT LIKE 'ai-extraction-%'
    AND p_worker_id NOT LIKE 'file-scan-%'
    AND p_worker_id NOT LIKE 'whatsapp-summary-%'
    AND p_worker_id NOT LIKE 'waha-cleanup-%'
  ) THEN RAISE EXCEPTION 'Worker tidak terotorisasi'; END IF;

  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN
    RAISE EXCEPTION 'Notification worker hanya dapat claim event notification';
  END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type NOT IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested', 'ai_intake_requested') THEN
    RAISE EXCEPTION 'AI worker hanya dapat claim event AI';
  END IF;
  IF p_worker_id LIKE 'whatsapp-summary-%' AND p_event_type IS DISTINCT FROM 'whatsapp_conversation_summary_requested' THEN
    RAISE EXCEPTION 'Summary worker hanya dapat claim event summary WhatsApp';
  END IF;
  IF p_worker_id LIKE 'file-scan-%' AND p_event_type IS DISTINCT FROM 'file_scan_requested' THEN
    RAISE EXCEPTION 'File scan worker hanya dapat claim event file scan';
  END IF;
  IF p_worker_id LIKE 'waha-cleanup-%' AND p_event_type IS DISTINCT FROM 'waha_session_cleanup_requested' THEN
    RAISE EXCEPTION 'WAHA cleanup worker hanya dapat claim event cleanup WAHA';
  END IF;

  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row
  FROM acct_ctrl.outbox_events o
  JOIN acct_ctrl.organizations org ON org.id = o.organization_id
  WHERE o.status = 'pending'
    AND (org.deleted_at IS NULL OR o.event_type = 'waha_session_cleanup_requested')
    AND (
      (p_event_type = 'notification' AND o.event_type IN ('item_assigned', 'status_changed', 'comment_added', 'deadline_approaching', 'item_overdue', 'item_escalated', 'review_requested', 'review_approved', 'digest'))
      OR (p_event_type IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested', 'ai_intake_requested', 'whatsapp_conversation_summary_requested') AND o.event_type = p_event_type)
      OR (p_event_type = 'file_scan_requested' AND o.event_type = 'file_scan_requested')
      OR (p_event_type = 'waha_session_cleanup_requested' AND o.event_type = 'waha_session_cleanup_requested')
    )
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at
  FOR UPDATE OF o SKIP LOCKED LIMIT 1;

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
