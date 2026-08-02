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
  SELECT g.organization_id INTO v_organization_id
  FROM acct_ctrl.wa_groups g
  WHERE g.id = NEW.wa_group_id AND g.is_active;

  IF v_organization_id IS NULL THEN RETURN NEW; END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM NEW.received_at) / 604800) * 604800);

  INSERT INTO acct_ctrl.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    v_organization_id,
    'whatsapp_conversation_summary_requested',
    'wa_group',
    NEW.wa_group_id,
    jsonb_build_object('message_id', NEW.id, 'wa_group_id', NEW.wa_group_id, 'organization_id', v_organization_id, 'window_start', v_window_start)
  )
  ON CONFLICT (event_type, aggregate_type, aggregate_id, (payload->>'window_start')) WHERE event_type = 'whatsapp_conversation_summary_requested' DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM acct_ctrl.domain_events
    WHERE event_type = 'whatsapp_conversation_summary_requested'
      AND aggregate_type = 'wa_group'
      AND aggregate_id = NEW.wa_group_id
      AND payload->>'window_start' = v_window_start::text;
  END IF;

  INSERT INTO acct_ctrl.outbox_events (organization_id, domain_event_id, event_type, payload, max_retries)
  VALUES (
    v_organization_id,
    v_event_id,
    'whatsapp_conversation_summary_requested',
    jsonb_build_object('message_id', NEW.id, 'wa_group_id', NEW.wa_group_id, 'organization_id', v_organization_id, 'window_start', v_window_start),
    8
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_whatsapp_conversation_summary() TO service_role;
