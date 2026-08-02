CREATE TABLE acct_ctrl.whatsapp_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  wa_group_id UUID NOT NULL REFERENCES acct_ctrl.wa_groups(id),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  participant_count INTEGER NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
  participants JSONB NOT NULL DEFAULT '[]',
  latest_message_at TIMESTAMPTZ,
  deterministic_summary TEXT NOT NULL DEFAULT '',
  ai_summary TEXT,
  ai_action_suggestions JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_whatsapp_conversation_summaries_window_group
  ON acct_ctrl.whatsapp_conversation_summaries(organization_id, wa_group_id, window_start)
;

CREATE INDEX idx_whatsapp_conversation_summaries_latest
  ON acct_ctrl.whatsapp_conversation_summaries(organization_id, latest_message_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_whatsapp_conversation_summary_event_window
  ON acct_ctrl.domain_events(event_type, aggregate_type, aggregate_id, (payload->>'window_start'))
  WHERE event_type = 'whatsapp_conversation_summary_requested';

ALTER TABLE acct_ctrl.whatsapp_conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_whatsapp_conversation_summaries" ON acct_ctrl.whatsapp_conversation_summaries
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));

CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_organization_id UUID;
  v_window_start TIMESTAMPTZ;
  v_event_id UUID;
BEGIN
  SELECT g.organization_id INTO v_organization_id FROM acct_ctrl.wa_groups g WHERE g.id = NEW.wa_group_id AND g.is_active;
  IF v_organization_id IS NULL THEN RETURN NEW; END IF;
  v_window_start := to_timestamp(floor(extract(epoch FROM NEW.received_at) / 604800) * 604800);
  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (v_organization_id, 'whatsapp_conversation_summary_requested', 'wa_group', NEW.wa_group_id, jsonb_build_object('message_id', NEW.id, 'wa_group_id', NEW.wa_group_id, 'organization_id', v_organization_id, 'window_start', v_window_start))
  ON CONFLICT (event_type, aggregate_type, aggregate_id, (payload->>'window_start')) WHERE event_type = 'whatsapp_conversation_summary_requested' DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM acct_ctrl.domain_events
    WHERE event_type = 'whatsapp_conversation_summary_requested'
      AND aggregate_type = 'wa_group'
      AND aggregate_id = NEW.wa_group_id
      AND payload->>'window_start' = jsonb_build_object('window_start', v_window_start)->>'window_start';
  END IF;
  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (v_organization_id, v_event_id, 'whatsapp_conversation_summary_requested', jsonb_build_object('message_id', NEW.id, 'wa_group_id', NEW.wa_group_id, 'organization_id', v_organization_id, 'window_start', v_window_start), 8)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_whatsapp_conversation_summary ON acct_ctrl.wa_messages;
CREATE TRIGGER trg_enqueue_whatsapp_conversation_summary
AFTER INSERT ON acct_ctrl.wa_messages
FOR EACH ROW EXECUTE FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary();

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary() TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.claim_outbox_event(p_worker_id TEXT, p_event_type TEXT DEFAULT NULL, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF acct_ctrl.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE v_row acct_ctrl.outbox_events%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR (p_worker_id NOT LIKE 'notification-%' AND p_worker_id NOT LIKE 'ai-extraction-%' AND p_worker_id NOT LIKE 'whatsapp-summary-%') THEN
    RAISE EXCEPTION 'Worker tidak terotorisasi';
  END IF;
  IF p_worker_id LIKE 'notification-%' AND p_event_type IS DISTINCT FROM 'notification' THEN
    RAISE EXCEPTION 'Notification worker hanya dapat claim event notification';
  END IF;
  IF p_worker_id LIKE 'ai-extraction-%' AND p_event_type NOT IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested') THEN
    RAISE EXCEPTION 'WhatsApp worker hanya dapat claim event WhatsApp';
  END IF;
  IF p_worker_id LIKE 'whatsapp-summary-%' AND p_event_type IS DISTINCT FROM 'whatsapp_conversation_summary_requested' THEN
    RAISE EXCEPTION 'Summary worker hanya dapat claim event summary WhatsApp';
  END IF;
  PERFORM acct_ctrl.recover_expired_outbox_events(100);
  SELECT o.* INTO v_row FROM acct_ctrl.outbox_events o
  WHERE o.status = 'pending'
    AND ((p_event_type = 'notification' AND o.event_type IN ('item_assigned', 'status_changed', 'comment_added', 'deadline_approaching', 'item_overdue', 'item_escalated', 'review_requested', 'review_approved', 'digest'))
      OR (p_event_type IN ('whatsapp_message_received', 'whatsapp_reply_requested', 'ai_extraction_requested', 'whatsapp_conversation_summary_requested') AND o.event_type = p_event_type))
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE acct_ctrl.outbox_events SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id, claim_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)) WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_outbox_event(TEXT, TEXT, INTEGER) TO service_role;
