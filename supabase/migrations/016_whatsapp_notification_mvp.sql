ALTER TABLE acct_ctrl.notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_hour SMALLINT NOT NULL DEFAULT 8;

ALTER TABLE acct_ctrl.notification_preferences
  ADD CONSTRAINT notification_preferences_digest_hour_range
  CHECK (digest_hour BETWEEN 0 AND 23);

CREATE OR REPLACE FUNCTION acct_ctrl.confirm_action_suggestion(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_confirmed_by UUID
)
RETURNS TABLE(suggestion_id UUID, work_item_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  suggestion acct_ctrl.action_suggestions%ROWTYPE;
  created_id UUID;
BEGIN
  SELECT * INTO suggestion
  FROM acct_ctrl.action_suggestions
  WHERE id = p_suggestion_id
    AND organization_id = p_organization_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion tidak ditemukan atau sudah diproses';
  END IF;
  IF suggestion.suggested_client_id IS NULL THEN
    RAISE EXCEPTION 'Suggestion belum memiliki client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.clients
    WHERE id = suggestion.suggested_client_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client suggestion tidak valid';
  END IF;
  IF suggestion.suggested_maker_id IS NOT NULL AND suggestion.suggested_checker_id IS NOT NULL
     AND suggestion.suggested_maker_id = suggestion.suggested_checker_id THEN
    RAISE EXCEPTION 'Maker dan checker harus berbeda';
  END IF;

  INSERT INTO acct_ctrl.work_items (
    organization_id, client_id, section_id, type, title, description, due_at,
    source_type, source_reference_id, source_metadata, status, created_by
  ) VALUES (
    p_organization_id, suggestion.suggested_client_id, suggestion.suggested_section_id,
    'ad_hoc', suggestion.suggested_title, suggestion.suggested_description,
    suggestion.suggested_due_at, suggestion.source_type, suggestion.source_reference_id,
    suggestion.source_metadata || jsonb_build_object('confirmed_by', p_confirmed_by, 'confirmed_at', now()),
    'draft', p_confirmed_by
  ) RETURNING id INTO created_id;

  IF suggestion.suggested_maker_id IS NOT NULL THEN
    INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
    VALUES (created_id, suggestion.suggested_maker_id, 'maker', p_confirmed_by);
  END IF;
  IF suggestion.suggested_checker_id IS NOT NULL THEN
    INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
    VALUES (created_id, suggestion.suggested_checker_id, 'checker', p_confirmed_by);
  END IF;

  UPDATE acct_ctrl.action_suggestions
  SET status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now(),
      created_work_item_id = created_id, updated_at = now()
  WHERE id = suggestion.id;

  RETURN QUERY SELECT suggestion.id, created_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.confirm_action_suggestion(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.confirm_action_suggestion(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.create_whatsapp_command_work_item(
  p_organization_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_due_at TIMESTAMPTZ,
  p_source_reference_id UUID,
  p_source_metadata JSONB,
  p_created_by UUID,
  p_maker_id UUID,
  p_checker_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  created_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.clients
    WHERE id = p_client_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client command tidak valid';
  END IF;
  IF p_maker_id = p_checker_id THEN
    RAISE EXCEPTION 'Maker dan checker harus berbeda';
  END IF;
  INSERT INTO acct_ctrl.work_items (
    organization_id, client_id, type, title, due_at, source_type,
    source_reference_id, source_metadata, status, created_by
  ) VALUES (
    p_organization_id, p_client_id, 'ad_hoc', p_title, p_due_at, 'whatsapp_command',
    p_source_reference_id, p_source_metadata, 'draft', p_created_by
  ) RETURNING work_items.id INTO created_id;
  INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
  VALUES (created_id, p_maker_id, 'maker', p_created_by);
  IF p_checker_id IS NOT NULL THEN
    INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
    VALUES (created_id, p_checker_id, 'checker', p_created_by);
  END IF;
  RETURN QUERY SELECT created_id, p_title;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_whatsapp_command_work_item(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_whatsapp_command_work_item(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB, UUID, UUID, UUID) TO service_role;
