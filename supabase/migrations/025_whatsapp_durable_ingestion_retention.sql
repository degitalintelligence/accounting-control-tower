CREATE TABLE acct_ctrl.whatsapp_retention_policies (
  organization_id UUID PRIMARY KEY REFERENCES acct_ctrl.organizations(id),
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
  raw_payload_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (raw_payload_retention_days BETWEEN 1 AND 3650),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_ctrl.whatsapp_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_whatsapp_retention_policies" ON acct_ctrl.whatsapp_retention_policies
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));

CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_whatsapp_message(
  p_connection_id UUID,
  p_wa_group_id UUID,
  p_organization_id UUID,
  p_provider_message_id TEXT,
  p_sender_participant_id TEXT,
  p_content TEXT,
  p_message_type TEXT,
  p_media_metadata JSONB,
  p_raw_payload JSONB,
  p_received_at TIMESTAMPTZ,
  p_event_type TEXT,
  p_event_payload JSONB
)
RETURNS TABLE(message_id UUID, duplicate BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_message_id UUID;
  v_event_id UUID;
BEGIN
  INSERT INTO acct_ctrl.wa_messages (
    connection_id, wa_group_id, provider_message_id, sender_participant_id,
    content, message_type, media_metadata, raw_payload, received_at
  ) VALUES (
    p_connection_id, p_wa_group_id, p_provider_message_id, p_sender_participant_id,
    p_content, p_message_type, COALESCE(p_media_metadata, '{}'), p_raw_payload, p_received_at
  )
  RETURNING id INTO v_message_id;

  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (p_organization_id, p_event_type, 'wa_message', v_message_id, p_event_payload || jsonb_build_object('message_id', v_message_id, 'organization_id', p_organization_id))
  RETURNING id INTO v_event_id;

  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (p_organization_id, v_event_id, p_event_type, p_event_payload || jsonb_build_object('message_id', v_message_id, 'organization_id', p_organization_id), 5);

  RETURN QUERY SELECT v_message_id, false;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_message_id FROM acct_ctrl.wa_messages
  WHERE connection_id = p_connection_id AND provider_message_id = p_provider_message_id;
  RETURN QUERY SELECT v_message_id, true;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_whatsapp_message(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_whatsapp_message(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ, TEXT, JSONB) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_message_event
  ON acct_ctrl.domain_events(event_type, aggregate_type, aggregate_id)
  WHERE event_type = 'whatsapp_message_received';

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_reply_event
  ON acct_ctrl.domain_events(event_type, aggregate_type, aggregate_id)
  WHERE event_type = 'whatsapp_reply_requested';

CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_whatsapp_reply(
  p_organization_id UUID,
  p_message_id UUID,
  p_chat_id TEXT,
  p_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (p_organization_id, 'whatsapp_reply_requested', 'wa_message', p_message_id, jsonb_build_object('message_id', p_message_id, 'chat_id', p_chat_id, 'text', left(p_text, 4000)))
  ON CONFLICT (event_type, aggregate_type, aggregate_id) WHERE event_type = 'whatsapp_reply_requested' DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM acct_ctrl.domain_events WHERE event_type = 'whatsapp_reply_requested' AND aggregate_type = 'wa_message' AND aggregate_id = p_message_id;
    RETURN v_event_id;
  END IF;
  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (p_organization_id, v_event_id, 'whatsapp_reply_requested', jsonb_build_object('message_id', p_message_id, 'chat_id', p_chat_id, 'text', left(p_text, 4000)), 8);
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_whatsapp_reply(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_whatsapp_reply(UUID, UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.cleanup_whatsapp_retention(p_limit INTEGER DEFAULT 5000)
RETURNS TABLE(raw_payloads_cleaned INTEGER, messages_deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_raw INTEGER;
  v_deleted INTEGER;
BEGIN
  WITH candidates AS (
    SELECT m.id
    FROM acct_ctrl.wa_messages m
    JOIN acct_ctrl.whatsapp_retention_policies p ON p.organization_id = (SELECT organization_id FROM acct_ctrl.wa_groups WHERE id = m.wa_group_id)
    WHERE p.is_active AND m.raw_payload IS NOT NULL
      AND m.received_at < now() - make_interval(days => p.raw_payload_retention_days)
    ORDER BY m.received_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE acct_ctrl.wa_messages m SET raw_payload = NULL
  FROM candidates WHERE m.id = candidates.id;
  GET DIAGNOSTICS v_raw = ROW_COUNT;

  WITH candidates AS (
    SELECT m.id
    FROM acct_ctrl.wa_messages m
    JOIN acct_ctrl.whatsapp_retention_policies p ON p.organization_id = (SELECT organization_id FROM acct_ctrl.wa_groups WHERE id = m.wa_group_id)
    WHERE p.is_active AND m.received_at < now() - make_interval(days => p.retention_days)
      AND NOT EXISTS (SELECT 1 FROM acct_ctrl.ai_extraction_runs r WHERE r.wa_message_id = m.id)
    ORDER BY m.received_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM acct_ctrl.wa_messages m USING candidates WHERE m.id = candidates.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_raw, v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.cleanup_whatsapp_retention(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.cleanup_whatsapp_retention(INTEGER) TO service_role;
