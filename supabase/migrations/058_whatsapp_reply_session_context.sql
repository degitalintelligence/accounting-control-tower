DROP FUNCTION IF EXISTS acct_ctrl.enqueue_whatsapp_reply(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_whatsapp_reply(
  p_organization_id UUID,
  p_message_id UUID,
  p_connection_id UUID,
  p_session_id TEXT,
  p_provider TEXT,
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
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'message_id', p_message_id,
    'connection_id', p_connection_id,
    'session_id', p_session_id,
    'provider', p_provider,
    'chat_id', p_chat_id,
    'text', left(p_text, 4000)
  );
  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (p_organization_id, 'whatsapp_reply_requested', 'wa_message', p_message_id, v_payload)
  ON CONFLICT (event_type, aggregate_type, aggregate_id) WHERE event_type = 'whatsapp_reply_requested' DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM acct_ctrl.domain_events
    WHERE event_type = 'whatsapp_reply_requested'
      AND aggregate_type = 'wa_message'
      AND aggregate_id = p_message_id;
    RETURN v_event_id;
  END IF;
  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (p_organization_id, v_event_id, 'whatsapp_reply_requested', v_payload, 8);
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_whatsapp_reply(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_whatsapp_reply(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
