ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS business_period TEXT,
  ADD COLUMN IF NOT EXISTS suggested_entity_id UUID,
  ADD COLUMN IF NOT EXISTS duplicate_warning_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicate_warning_acknowledged_by UUID REFERENCES acct_ctrl.profiles(id);

CREATE OR REPLACE FUNCTION acct_ctrl.confirm_action_suggestion(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_confirmed_by UUID,
  p_client_id UUID DEFAULT NULL,
  p_duplicate_action TEXT DEFAULT 'warn'
)
RETURNS TABLE(suggestion_id UUID, work_item_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  suggestion acct_ctrl.action_suggestions%ROWTYPE;
  created_id UUID;
  selected_client_id UUID;
  duplicate_rows JSONB;
  normalized_period TEXT;
BEGIN
  IF p_duplicate_action NOT IN ('warn', 'allow') THEN
    RAISE EXCEPTION 'duplicate_action tidak valid';
  END IF;
  SELECT * INTO suggestion FROM acct_ctrl.action_suggestions
  WHERE id = p_suggestion_id AND organization_id = p_organization_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion tidak ditemukan atau sudah diproses'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships WHERE organization_id = p_organization_id AND profile_id = p_confirmed_by AND is_active) THEN
    RAISE EXCEPTION 'Konfirmasi tidak memiliki membership aktif';
  END IF;
  selected_client_id := COALESCE(p_client_id, suggestion.suggested_client_id);
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.clients WHERE id = selected_client_id AND organization_id = p_organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Client suggestion tidak valid';
  END IF;
  normalized_period := suggestion.business_period;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::TEXT || ':' || selected_client_id::TEXT || ':ad_hoc:' || acct_ctrl.normalize_work_item_title(suggestion.suggested_title) || ':' || COALESCE(normalized_period, ''), 0));
  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO duplicate_rows
  FROM acct_ctrl.find_business_task_duplicates(p_organization_id, selected_client_id, 'ad_hoc', suggestion.suggested_title, normalized_period, suggestion.suggested_entity_id, suggestion.suggested_section_id, NULL) d;
  IF jsonb_array_length(duplicate_rows) > 0 AND p_duplicate_action <> 'allow' THEN
    RAISE EXCEPTION 'DUPLICATE_BUSINESS_TASK' USING DETAIL = duplicate_rows::TEXT;
  END IF;
  INSERT INTO acct_ctrl.work_items (organization_id, client_id, entity_id, section_id, type, title, description, due_at, business_period, duplicate_warning_acknowledged_at, duplicate_warning_acknowledged_by, source_type, source_reference_id, source_metadata, status, created_by)
  VALUES (p_organization_id, selected_client_id, suggestion.suggested_entity_id, suggestion.suggested_section_id, 'ad_hoc', suggestion.suggested_title, suggestion.suggested_description, suggestion.suggested_due_at, normalized_period, CASE WHEN p_duplicate_action = 'allow' AND jsonb_array_length(duplicate_rows) > 0 THEN now() END, CASE WHEN p_duplicate_action = 'allow' AND jsonb_array_length(duplicate_rows) > 0 THEN p_confirmed_by END, suggestion.source_type, suggestion.source_reference_id, suggestion.source_metadata || jsonb_build_object('confirmed_by', p_confirmed_by, 'confirmed_at', now(), 'duplicate_warning_acknowledged', p_duplicate_action = 'allow' AND jsonb_array_length(duplicate_rows) > 0), 'draft', p_confirmed_by)
  RETURNING id INTO created_id;
  IF suggestion.suggested_maker_id IS NOT NULL THEN INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (created_id, suggestion.suggested_maker_id, 'maker', p_confirmed_by); END IF;
  IF suggestion.suggested_checker_id IS NOT NULL THEN INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (created_id, suggestion.suggested_checker_id, 'checker', p_confirmed_by); END IF;
  UPDATE acct_ctrl.action_suggestions SET status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now(), created_work_item_id = created_id, duplicate_warning_acknowledged_at = CASE WHEN p_duplicate_action = 'allow' AND jsonb_array_length(duplicate_rows) > 0 THEN now() END, duplicate_warning_acknowledged_by = CASE WHEN p_duplicate_action = 'allow' AND jsonb_array_length(duplicate_rows) > 0 THEN p_confirmed_by END, updated_at = now() WHERE id = suggestion.id;
  RETURN QUERY SELECT suggestion.id, created_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.confirm_action_suggestion(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.confirm_action_suggestion(UUID, UUID, UUID, UUID, TEXT) TO service_role;
