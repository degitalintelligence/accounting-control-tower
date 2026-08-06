CREATE OR REPLACE FUNCTION acct_ctrl.create_audit_finding_with_corrective_action(
  p_organization_id UUID,
  p_audit_sample_id UUID,
  p_finding_type TEXT,
  p_severity TEXT,
  p_description TEXT,
  p_evidence TEXT DEFAULT NULL,
  p_root_cause TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  sample acct_ctrl.audit_samples%ROWTYPE;
  item acct_ctrl.work_items%ROWTYPE;
  finding acct_ctrl.audit_findings%ROWTYPE;
  v_corrective_task_id UUID;
  action_owner UUID;
  normalized_severity TEXT := lower(btrim(p_severity));
BEGIN
  SELECT * INTO sample
  FROM acct_ctrl.audit_samples
  WHERE id = p_audit_sample_id
    AND organization_id = p_organization_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit sample tidak ditemukan pada organization' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO item
  FROM acct_ctrl.work_items
  WHERE id = sample.work_item_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work item audit tidak ditemukan pada organization' USING ERRCODE = 'P0002';
  END IF;

  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships m
    WHERE m.organization_id = p_organization_id
      AND m.profile_id = p_actor_id
      AND m.is_active
      AND (m.client_id IS NULL OR m.client_id = item.client_id)
  ) THEN
    RAISE EXCEPTION 'Actor tidak memiliki akses ke work item audit' USING ERRCODE = '42501';
  END IF;

  IF normalized_severity NOT IN ('minor', 'moderate', 'major', 'critical') THEN
    RAISE EXCEPTION 'Severity finding tidak valid' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(p_finding_type), '') IS NULL OR NULLIF(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Finding type dan description wajib diisi' USING ERRCODE = '23514';
  END IF;
  IF normalized_severity IN ('major', 'critical') AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Due date wajib untuk finding Major atau Critical' USING ERRCODE = '23514';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships m
    WHERE m.organization_id = p_organization_id
      AND m.profile_id = p_owner_id
      AND m.is_active
      AND (m.client_id IS NULL OR m.client_id = item.client_id)
  ) THEN
    RAISE EXCEPTION 'Owner bukan anggota tenant pada scope client' USING ERRCODE = '23514';
  END IF;

  INSERT INTO acct_ctrl.audit_findings (
    client_id, audit_sample_id, finding_type, severity, description,
    evidence, root_cause, owner_id, due_date
  ) VALUES (
    item.client_id, p_audit_sample_id, btrim(p_finding_type), normalized_severity,
    btrim(p_description), p_evidence, p_root_cause, p_owner_id, p_due_date
  )
  RETURNING * INTO finding;

  IF normalized_severity IN ('major', 'critical') THEN
    action_owner := COALESCE(p_owner_id, p_actor_id);
    INSERT INTO acct_ctrl.work_items (
      organization_id, client_id, type, title, description,
      acceptance_criteria, status, priority, risk_level, due_at, created_by
    ) VALUES (
      p_organization_id, item.client_id, 'ad_hoc',
      'Corrective action: ' || left(finding.description, 400),
      finding.description, 'Tindakan korektif selesai dan diverifikasi.',
      'assigned',
      CASE WHEN normalized_severity = 'critical' THEN 'critical'::acct_ctrl.priority_level ELSE 'high'::acct_ctrl.priority_level END,
      CASE WHEN normalized_severity = 'critical' THEN 'critical'::acct_ctrl.risk_level ELSE 'high'::acct_ctrl.risk_level END,
      p_due_date::timestamptz, p_actor_id
    )
    RETURNING id INTO v_corrective_task_id;

    INSERT INTO acct_ctrl.assignments (work_item_id, profile_id, role, assigned_by)
    VALUES (v_corrective_task_id, action_owner, 'maker', p_actor_id);

    UPDATE acct_ctrl.audit_findings
    SET corrective_task_id = v_corrective_task_id,
        updated_at = now()
    WHERE id = finding.id
    RETURNING * INTO finding;
  END IF;

  RETURN to_jsonb(finding);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_audit_finding_with_corrective_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_audit_finding_with_corrective_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, DATE, UUID) TO service_role;
