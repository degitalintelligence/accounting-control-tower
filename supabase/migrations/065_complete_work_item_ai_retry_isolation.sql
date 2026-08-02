CREATE OR REPLACE FUNCTION acct_ctrl.create_work_item_with_assignment(
  p_title TEXT,
  p_type acct_ctrl.work_item_type,
  p_organization_id UUID,
  p_client_id UUID,
  p_description TEXT,
  p_acceptance_criteria TEXT,
  p_priority acct_ctrl.priority_level,
  p_risk_level acct_ctrl.risk_level,
  p_due_at TIMESTAMPTZ,
  p_start_at TIMESTAMPTZ,
  p_project_id UUID,
  p_parent_id UUID,
  p_entity_id UUID,
  p_section_id UUID,
  p_created_by UUID,
  p_assignee_id UUID,
  p_assignee_role acct_ctrl.assignment_role,
  p_business_period TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency_code TEXT DEFAULT NULL,
  p_approval_requirement TEXT DEFAULT 'none',
  p_required_approval_level INTEGER DEFAULT 0,
  p_approval_policy_id UUID DEFAULT NULL,
  p_approval_policy_version INTEGER DEFAULT NULL,
  p_policy_evaluated_at TIMESTAMPTZ DEFAULT NULL,
  p_checklist_template_id UUID DEFAULT NULL,
  p_duplicate_warning_acknowledged_at TIMESTAMPTZ DEFAULT NULL,
  p_duplicate_warning_acknowledged_by UUID DEFAULT NULL
)
RETURNS SETOF acct_ctrl.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  created_item acct_ctrl.work_items;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.clients
    WHERE id = p_client_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client work item tidak valid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships
    WHERE profile_id = p_created_by AND organization_id = p_organization_id AND is_active
      AND (client_id IS NULL OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Pembuat work item tidak memiliki membership aktif pada scope client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships
    WHERE profile_id = p_assignee_id AND organization_id = p_organization_id AND is_active
      AND (client_id IS NULL OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Assignee tidak memiliki membership aktif pada scope client';
  END IF;
  INSERT INTO acct_ctrl.work_items (
    title, type, organization_id, client_id, description, acceptance_criteria,
    priority, risk_level, due_at, start_at, project_id, parent_id, entity_id,
    section_id, status, created_by, business_period, amount, currency_code,
    approval_requirement, required_approval_level, approval_policy_id,
    approval_policy_version, policy_evaluated_at, checklist_template_id,
    duplicate_warning_acknowledged_at, duplicate_warning_acknowledged_by
  ) VALUES (
    p_title, p_type, p_organization_id, p_client_id, p_description,
    p_acceptance_criteria, p_priority, p_risk_level, p_due_at, p_start_at,
    p_project_id, p_parent_id, p_entity_id, p_section_id, 'draft', p_created_by,
    p_business_period, p_amount, p_currency_code, p_approval_requirement,
    p_required_approval_level, p_approval_policy_id, p_approval_policy_version,
    p_policy_evaluated_at, p_checklist_template_id,
    p_duplicate_warning_acknowledged_at, p_duplicate_warning_acknowledged_by
  ) RETURNING * INTO created_item;
  INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
  VALUES (created_item.id, p_assignee_id, p_assignee_role, p_created_by);
  RETURN NEXT created_item;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_work_item_with_assignment(TEXT, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role, TEXT, NUMERIC, TEXT, TEXT, INTEGER, UUID, INTEGER, TIMESTAMPTZ, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_work_item_with_assignment(TEXT, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role, TEXT, NUMERIC, TEXT, TEXT, INTEGER, UUID, INTEGER, TIMESTAMPTZ, UUID, TIMESTAMPTZ, UUID) TO service_role;
REVOKE ALL ON FUNCTION acct_ctrl.create_work_item_with_assignment(TEXT, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_work_item_with_assignment(TEXT, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role) TO service_role;

ALTER TABLE acct_ctrl.ai_draft_items ADD COLUMN IF NOT EXISTS source_task_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_draft_items_intake_task_key
  ON acct_ctrl.ai_draft_items(intake_id, source_task_key)
  WHERE intake_id IS NOT NULL AND source_task_key IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_decisions_topic_identity
  ON acct_ctrl.whatsapp_conversation_decisions(topic_id, title, decision_value);

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
  SELECT o.* INTO v_row FROM acct_ctrl.outbox_events o
  WHERE o.status = 'pending'
    AND ((p_event_type = 'notification' AND o.event_type IN ('item_assigned','status_changed','comment_added','deadline_approaching','item_overdue','item_escalated','review_requested','review_approved','digest'))
      OR (p_event_type IN ('whatsapp_message_received','whatsapp_reply_requested','ai_extraction_requested','ai_intake_requested','whatsapp_conversation_summary_requested') AND o.event_type = p_event_type)
      OR (p_event_type = 'file_scan_requested' AND o.event_type = 'file_scan_requested'))
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id, claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)) WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) TO service_role;
