CREATE OR REPLACE FUNCTION acct_ctrl.confirm_ai_draft_item(
  p_draft_id UUID, p_organization_id UUID, p_confirmed_by UUID, p_client_id UUID,
  p_title TEXT, p_type acct_ctrl.work_item_type DEFAULT 'ad_hoc', p_description TEXT DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL, p_maker_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL
)
RETURNS TABLE(draft_id UUID, work_item_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE draft acct_ctrl.ai_draft_items%ROWTYPE; item_id UUID;
BEGIN
  SELECT * INTO draft FROM acct_ctrl.ai_draft_items WHERE id = p_draft_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft AI tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF draft.status <> 'draft' THEN
    IF draft.status = 'confirmed' AND draft.confirmed_work_item_id IS NOT NULL THEN RETURN QUERY SELECT draft.id, draft.confirmed_work_item_id; RETURN; END IF;
    RAISE EXCEPTION 'Draft ini sudah diproses' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = p_organization_id AND m.profile_id = p_confirmed_by AND m.is_active) THEN RAISE EXCEPTION 'Konfirmasi tidak berwenang' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.clients c WHERE c.id = p_client_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'Client tidak ditemukan' USING ERRCODE = '23503'; END IF;
  IF NULLIF(BTRIM(p_title), '') IS NULL THEN RAISE EXCEPTION 'Judul wajib diisi' USING ERRCODE = '23514'; END IF;
  IF p_maker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = p_organization_id AND m.profile_id = p_maker_id AND m.is_active AND (m.client_id IS NULL OR m.client_id = p_client_id)) THEN RAISE EXCEPTION 'PIC tidak memiliki akses ke client' USING ERRCODE = '42501'; END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acct_ctrl.work_items p WHERE p.id = p_project_id AND p.organization_id = p_organization_id AND p.client_id = p_client_id AND p.deleted_at IS NULL) THEN RAISE EXCEPTION 'Project tidak ditemukan' USING ERRCODE = '23503'; END IF;
  INSERT INTO acct_ctrl.work_items(organization_id, client_id, project_id, created_by, title, description, type, due_at, status, priority, source_type, source_metadata)
  VALUES (p_organization_id, p_client_id, p_project_id, p_confirmed_by, BTRIM(p_title), p_description, p_type, p_due_at, 'draft', 'medium', 'api', jsonb_build_object('ai_draft_id', p_draft_id, 'confirmed_by', p_confirmed_by, 'confirmed_at', now())) RETURNING id INTO item_id;
  IF p_maker_id IS NOT NULL THEN INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (item_id, p_maker_id, 'maker', p_confirmed_by); END IF;
  UPDATE acct_ctrl.ai_draft_items SET status = 'confirmed', client_id = p_client_id, maker_id = p_maker_id, confirmed_work_item_id = item_id, updated_at = now() WHERE id = p_draft_id;
  RETURN QUERY SELECT p_draft_id, item_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.confirm_ai_draft_item(UUID,UUID,UUID,UUID,TEXT,acct_ctrl.work_item_type,TEXT,TIMESTAMPTZ,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.confirm_ai_draft_item(UUID,UUID,UUID,UUID,TEXT,acct_ctrl.work_item_type,TEXT,TIMESTAMPTZ,UUID,UUID) TO service_role;
