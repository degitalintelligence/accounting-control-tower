ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS decision_type TEXT,
  ADD COLUMN IF NOT EXISTS target_work_item_id UUID REFERENCES acct_ctrl.work_items(id),
  ADD COLUMN IF NOT EXISTS decision_note TEXT;

ALTER TABLE acct_ctrl.action_suggestions
  ADD CONSTRAINT action_suggestions_decision_type_check
  CHECK (decision_type IS NULL OR decision_type IN ('work_item', 'project', 'update_existing', 'information_only'));

CREATE OR REPLACE FUNCTION acct_ctrl.confirm_action_suggestion_choice(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_confirmed_by UUID,
  p_action_type TEXT,
  p_client_id UUID DEFAULT NULL,
  p_target_work_item_id UUID DEFAULT NULL,
  p_duplicate_action TEXT DEFAULT 'warn',
  p_decision_note TEXT DEFAULT NULL
)
RETURNS TABLE(suggestion_id UUID, work_item_id UUID, project_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  suggestion acct_ctrl.action_suggestions%ROWTYPE;
  selected_client_id UUID;
  v_work_item_id UUID;
  v_project_id UUID;
BEGIN
  IF p_action_type NOT IN ('work_item', 'project', 'update_existing', 'information_only') THEN
    RAISE EXCEPTION 'Jenis tindakan tidak valid';
  END IF;
  IF p_duplicate_action NOT IN ('warn', 'allow') THEN
    RAISE EXCEPTION 'duplicate_action tidak valid';
  END IF;

  SELECT * INTO suggestion
  FROM acct_ctrl.action_suggestions
  WHERE id = p_suggestion_id AND organization_id = p_organization_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion tidak ditemukan atau sudah diproses'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships WHERE organization_id = p_organization_id AND profile_id = p_confirmed_by AND is_active) THEN
    RAISE EXCEPTION 'Konfirmasi tidak memiliki membership aktif';
  END IF;

  selected_client_id := COALESCE(p_client_id, suggestion.suggested_client_id);
  IF p_action_type <> 'information_only' AND NOT EXISTS (SELECT 1 FROM acct_ctrl.clients WHERE id = selected_client_id AND organization_id = p_organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Client suggestion tidak valid';
  END IF;

  IF p_action_type = 'information_only' THEN
    NULL;
  ELSIF p_action_type = 'update_existing' THEN
    IF p_target_work_item_id IS NULL THEN RAISE EXCEPTION 'Work item tujuan wajib dipilih'; END IF;
    IF NOT EXISTS (SELECT 1 FROM acct_ctrl.work_items WHERE id = p_target_work_item_id AND organization_id = p_organization_id AND client_id = selected_client_id AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')) THEN
      RAISE EXCEPTION 'Work item tujuan tidak valid';
    END IF;
    UPDATE acct_ctrl.work_items
    SET description = COALESCE(suggestion.suggested_description, description),
        due_at = COALESCE(suggestion.suggested_due_at, due_at),
        source_metadata = source_metadata || jsonb_build_object('whatsapp_suggestion_id', suggestion.id, 'updated_by', p_confirmed_by),
        updated_at = now()
    WHERE id = p_target_work_item_id;
    v_work_item_id := p_target_work_item_id;
  ELSE
    IF p_duplicate_action = 'warn' AND EXISTS (
      SELECT 1 FROM acct_ctrl.work_items
      WHERE organization_id = p_organization_id AND client_id = selected_client_id AND type = CASE WHEN p_action_type = 'project' THEN 'project'::acct_ctrl.work_item_type ELSE 'ad_hoc'::acct_ctrl.work_item_type END
        AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')
        AND lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) = lower(regexp_replace(suggestion.suggested_title, '[^a-zA-Z0-9]+', ' ', 'g'))
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_BUSINESS_TASK';
    END IF;
    INSERT INTO acct_ctrl.work_items (organization_id, client_id, section_id, type, title, description, due_at, source_type, source_reference_id, source_metadata, status, created_by)
    VALUES (p_organization_id, selected_client_id, suggestion.suggested_section_id,
      CASE WHEN p_action_type = 'project' THEN 'project'::acct_ctrl.work_item_type ELSE 'ad_hoc'::acct_ctrl.work_item_type END,
      suggestion.suggested_title, suggestion.suggested_description, suggestion.suggested_due_at, suggestion.source_type, suggestion.source_reference_id,
      suggestion.source_metadata || jsonb_build_object('confirmed_by', p_confirmed_by, 'suggestion_id', suggestion.id), 'draft', p_confirmed_by)
    RETURNING id INTO v_work_item_id;
    IF suggestion.suggested_maker_id IS NOT NULL THEN INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (v_work_item_id, suggestion.suggested_maker_id, 'maker', p_confirmed_by); END IF;
    IF suggestion.suggested_checker_id IS NOT NULL THEN INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (v_work_item_id, suggestion.suggested_checker_id, 'checker', p_confirmed_by); END IF;
    IF p_action_type = 'project' THEN
      INSERT INTO acct_ctrl.projects(work_item_id, objective, target_date) VALUES (v_work_item_id, suggestion.suggested_description, suggestion.suggested_due_at::date) RETURNING id INTO v_project_id;
    END IF;
  END IF;

  UPDATE acct_ctrl.action_suggestions
  SET status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now(), created_work_item_id = v_work_item_id,
      target_work_item_id = COALESCE(p_target_work_item_id, target_work_item_id), decision_type = p_action_type,
      decision_note = p_decision_note, updated_at = now()
  WHERE id = suggestion.id;
  RETURN QUERY SELECT suggestion.id, v_work_item_id, v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.confirm_action_suggestion_choice(UUID, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.confirm_action_suggestion_choice(UUID, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT) TO service_role;
