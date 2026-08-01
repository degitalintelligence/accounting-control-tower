CREATE OR REPLACE FUNCTION acct_ctrl.create_work_item_with_assignment(
  p_title TEXT,
  p_type acct_ctrl.work_item_type,
  p_organization_id UUID,
  p_client_id UUID,
  p_description TEXT,
  p_acceptance_criteria TEXT,
  p_priority acct_ctrl.priority_level,
  p_risk_level acct_ctrl.risk_level,
  p_due_at TIMESTAMPTZ,
  p_start_at TIMESTAMPTZ,
  p_project_id UUID,
  p_parent_id UUID,
  p_entity_id UUID,
  p_section_id UUID,
  p_created_by UUID,
  p_assignee_id UUID,
  p_assignee_role acct_ctrl.assignment_role
)
RETURNS SETOF acct_ctrl.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  created_item acct_ctrl.work_items;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM acct_ctrl.clients
    WHERE id = p_client_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client work item tidak valid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM acct_ctrl.memberships
    WHERE profile_id = p_assignee_id
      AND organization_id = p_organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Assignee tidak memiliki membership aktif pada organisasi ini';
  END IF;
  INSERT INTO acct_ctrl.work_items (
    title, type, organization_id, client_id, description, acceptance_criteria,
    priority, risk_level, due_at, start_at, project_id, parent_id, entity_id,
    section_id, status, created_by
  ) VALUES (
    p_title, p_type, p_organization_id, p_client_id, p_description,
    p_acceptance_criteria, p_priority, p_risk_level, p_due_at, p_start_at,
    p_project_id, p_parent_id, p_entity_id, p_section_id, 'draft', p_created_by
  ) RETURNING * INTO created_item;

  INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by)
  VALUES (created_item.id, p_assignee_id, p_assignee_role, p_created_by);

  RETURN NEXT created_item;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_work_item_with_assignment(UUID, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_work_item_with_assignment(UUID, acct_ctrl.work_item_type, UUID, UUID, TEXT, TEXT, acct_ctrl.priority_level, acct_ctrl.risk_level, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, UUID, acct_ctrl.assignment_role) TO service_role;

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
  existing_item acct_ctrl.work_items;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::TEXT || ':' || p_source_reference_id::TEXT, 0));
  SELECT * INTO existing_item
  FROM acct_ctrl.work_items
  WHERE organization_id = p_organization_id
    AND source_type = 'whatsapp_command'
    AND source_reference_id = p_source_reference_id::TEXT
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing_item.id, existing_item.title;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.clients WHERE id = p_client_id AND organization_id = p_organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Client command tidak valid';
  END IF;
  IF p_maker_id = p_checker_id THEN
    RAISE EXCEPTION 'Maker dan checker harus berbeda';
  END IF;
  INSERT INTO acct_ctrl.work_items (organization_id, client_id, type, title, due_at, source_type, source_reference_id, source_metadata, status, created_by)
  VALUES (p_organization_id, p_client_id, 'ad_hoc', p_title, p_due_at, 'whatsapp_command', p_source_reference_id::TEXT, p_source_metadata, 'draft', p_created_by)
  RETURNING work_items.id INTO created_id;
  INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (created_id, p_maker_id, 'maker', p_created_by);
  IF p_checker_id IS NOT NULL THEN
    INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (created_id, p_checker_id, 'checker', p_created_by);
  END IF;
  RETURN QUERY SELECT created_id, p_title;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_whatsapp_command_work_item(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_whatsapp_command_work_item(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB, UUID, UUID, UUID) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_whatsapp_source_reference
  ON acct_ctrl.work_items(organization_id, source_reference_id)
  WHERE source_type = 'whatsapp_command' AND source_reference_id IS NOT NULL AND deleted_at IS NULL;
