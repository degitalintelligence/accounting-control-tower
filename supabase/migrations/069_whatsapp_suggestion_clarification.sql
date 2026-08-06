ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS clarification_question TEXT,
  ADD COLUMN IF NOT EXISTS clarification_requested_by UUID REFERENCES acct_ctrl.profiles(id),
  ADD COLUMN IF NOT EXISTS clarification_requested_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION acct_ctrl.request_action_suggestion_clarification(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_requested_by UUID,
  p_question TEXT
)
RETURNS TABLE(id UUID, review_state TEXT, clarification_question TEXT, clarification_requested_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  suggestion_row acct_ctrl.action_suggestions%ROWTYPE;
  message_row RECORD;
  event_id UUID;
  event_payload JSONB;
  event_key_value TEXT;
BEGIN
  IF length(btrim(p_question)) < 5 OR length(p_question) > 2000 THEN
    RAISE EXCEPTION 'Pertanyaan klarifikasi harus 5 sampai 2000 karakter';
  END IF;

  SELECT * INTO suggestion_row
  FROM acct_ctrl.action_suggestions AS suggestion_source
  WHERE suggestion_source.id = p_suggestion_id
    AND suggestion_source.organization_id = p_organization_id
    AND suggestion_source.status = 'pending'
    AND suggestion_source.claimed_by = p_requested_by
    AND suggestion_source.review_state = 'claimed'
    AND (suggestion_source.claim_expires_at IS NULL OR suggestion_source.claim_expires_at > now())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion tidak sedang direview oleh user ini atau claim sudah kedaluwarsa';
  END IF;

  SELECT message.id, message.connection_id, message.wa_group_id, message.provider_message_id,
         group_row.provider_group_id, connection.provider, connection.session_id
  INTO message_row
  FROM acct_ctrl.wa_messages AS message
  JOIN acct_ctrl.wa_groups AS group_row ON group_row.id = message.wa_group_id
  JOIN acct_ctrl.integration_connections AS connection ON connection.id = message.connection_id
  WHERE message.id::TEXT = suggestion_row.source_reference_id
    AND group_row.organization_id = p_organization_id
    AND group_row.is_active = TRUE
  LIMIT 1;

  IF NOT FOUND OR message_row.session_id IS NULL THEN
    RAISE EXCEPTION 'Pesan sumber WhatsApp tidak tersedia untuk klarifikasi';
  END IF;

  event_key_value := 'wa-clarification:' || p_suggestion_id::TEXT || ':' || md5(btrim(p_question));
  event_payload := jsonb_build_object(
    'suggestion_id', p_suggestion_id,
    'message_id', message_row.id,
    'connection_id', message_row.connection_id,
    'session_id', message_row.session_id,
    'provider', message_row.provider,
    'chat_id', message_row.provider_group_id,
    'text', left(btrim(p_question), 2000),
    'organization_id', p_organization_id,
    'requested_by', p_requested_by
  );

  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, event_key, payload)
  VALUES (p_organization_id, 'whatsapp_clarification_requested', 'action_suggestion', p_suggestion_id, event_key_value, event_payload)
  ON CONFLICT (event_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO event_id;

  UPDATE acct_ctrl.action_suggestions AS suggestion_update
  SET review_state = 'needs_clarification', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL,
      clarification_question = btrim(p_question), clarification_requested_by = p_requested_by,
      clarification_requested_at = now(), updated_at = now()
  WHERE suggestion_update.id = suggestion_row.id;

  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (p_organization_id, event_id, 'whatsapp_clarification_requested', event_payload, 8)
  ON CONFLICT (domain_event_id) DO NOTHING;

  INSERT INTO acct_ctrl.audit_logs (organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (p_organization_id, p_requested_by, 'wa_suggestion.clarification_requested', 'action_suggestion', p_suggestion_id,
    jsonb_build_object('review_state', 'claimed'),
    jsonb_build_object('review_state', 'needs_clarification'),
    jsonb_build_object('event_id', event_id));

  RETURN QUERY SELECT suggestion_row.id, 'needs_clarification'::TEXT, btrim(p_question), now();
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.request_action_suggestion_clarification(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.request_action_suggestion_clarification(UUID, UUID, UUID, TEXT) TO service_role;
