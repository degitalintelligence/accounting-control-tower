ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS clarification_response_message_id UUID REFERENCES acct_ctrl.wa_messages(id),
  ADD COLUMN IF NOT EXISTS clarification_response_text TEXT,
  ADD COLUMN IF NOT EXISTS clarification_response_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION acct_ctrl.resolve_action_suggestion_clarification(
  p_organization_id UUID,
  p_message_id UUID
)
RETURNS TABLE(suggestion_id UUID, review_state TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  incoming_message acct_ctrl.wa_messages%ROWTYPE;
  candidate_count INTEGER;
  candidate_id UUID;
BEGIN
  SELECT message.* INTO incoming_message
  FROM acct_ctrl.wa_messages AS message
  JOIN acct_ctrl.wa_groups AS incoming_group ON incoming_group.id = message.wa_group_id
  WHERE message.id = p_message_id
    AND incoming_group.organization_id = p_organization_id
    AND incoming_group.is_active = TRUE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*), min(suggestion_row.id)
  INTO candidate_count, candidate_id
  FROM acct_ctrl.action_suggestions AS suggestion_row
  JOIN acct_ctrl.wa_messages AS source_message ON source_message.id::TEXT = suggestion_row.source_reference_id
  JOIN acct_ctrl.wa_groups AS source_group ON source_group.id = source_message.wa_group_id
  WHERE suggestion_row.organization_id = p_organization_id
    AND suggestion_row.status = 'pending'
    AND suggestion_row.review_state = 'needs_clarification'
    AND source_group.id = incoming_message.wa_group_id
    AND (suggestion_row.clarification_response_message_id IS NULL OR suggestion_row.clarification_response_message_id <> p_message_id);

  IF candidate_count <> 1 THEN RETURN; END IF;

  UPDATE acct_ctrl.action_suggestions AS suggestion_update
  SET review_state = 'unclaimed',
      clarification_response_message_id = p_message_id,
      clarification_response_text = left(incoming_message.content, 4000),
      clarification_response_at = incoming_message.received_at,
      evidence_message_ids = CASE
        WHEN COALESCE(suggestion_update.evidence_message_ids, '[]'::jsonb) @> jsonb_build_array(p_message_id::TEXT) THEN COALESCE(suggestion_update.evidence_message_ids, '[]'::jsonb)
        ELSE COALESCE(suggestion_update.evidence_message_ids, '[]'::jsonb) || jsonb_build_array(p_message_id::TEXT)
      END,
      evidence_text = concat_ws(E'\n\n', NULLIF(suggestion_update.evidence_text, ''), 'Jawaban klarifikasi: ' || left(COALESCE(incoming_message.content, ''), 4000)),
      updated_at = now()
  WHERE suggestion_update.id = candidate_id
    AND suggestion_update.status = 'pending'
    AND suggestion_update.review_state = 'needs_clarification';

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, event_key, payload)
  VALUES (
    p_organization_id,
    'whatsapp_clarification_response_received',
    'action_suggestion',
    candidate_id,
    'wa-clarification-response:' || p_message_id::TEXT,
    jsonb_build_object('suggestion_id', candidate_id, 'message_id', p_message_id)
  ) ON CONFLICT (event_key) DO NOTHING;

  INSERT INTO acct_ctrl.audit_logs (organization_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    p_organization_id,
    'wa_suggestion.clarification_response_received',
    'action_suggestion',
    candidate_id,
    jsonb_build_object('review_state', 'needs_clarification'),
    jsonb_build_object('review_state', 'unclaimed'),
    jsonb_build_object('message_id', p_message_id)
  );

  RETURN QUERY SELECT candidate_id, 'unclaimed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.resolve_action_suggestion_clarification(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.resolve_action_suggestion_clarification(UUID, UUID) TO service_role;
