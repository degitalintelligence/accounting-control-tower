ALTER TABLE acct_ctrl.work_items
  ADD COLUMN IF NOT EXISTS report_stage TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_reference TEXT;

ALTER TABLE acct_ctrl.work_items
  ADD CONSTRAINT work_items_report_stage_valid CHECK (report_stage IN ('draft', 'prepared', 'submitted', 'accepted', 'rejected', 'delivered'));

ALTER TABLE acct_ctrl.files
  ADD CONSTRAINT files_checksum_sha256 CHECK (checksum ~ '^[0-9a-fA-F]{64}$'),
  ADD CONSTRAINT files_size_positive CHECK (size_bytes IS NULL OR size_bytes > 0);

CREATE OR REPLACE FUNCTION acct_ctrl.lock_work_item_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.status IN ('approved', 'awaiting_approval', 'completed') THEN
    UPDATE acct_ctrl.files f
    SET is_locked = true
    WHERE EXISTS (
      SELECT 1 FROM acct_ctrl.work_item_files wif
      WHERE wif.work_item_id = NEW.id AND wif.file_id = f.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.validate_report_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.type = 'report' AND NEW.status = 'completed' AND NEW.report_stage <> 'delivered' THEN
    RAISE EXCEPTION 'report harus delivered sebelum completed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_completion ON acct_ctrl.work_items;
CREATE TRIGGER trg_validate_report_completion
  BEFORE UPDATE OF status, report_stage ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_report_completion();

DROP TRIGGER IF EXISTS trg_lock_work_item_evidence ON acct_ctrl.work_items;
CREATE TRIGGER trg_lock_work_item_evidence
  AFTER INSERT OR UPDATE OF status ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.lock_work_item_evidence();

CREATE OR REPLACE FUNCTION acct_ctrl.work_item_gate(p_work_item_id UUID, p_gate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  missing_count INTEGER;
BEGIN
  IF p_gate = 'checklist' THEN
    SELECT COUNT(*) INTO missing_count
    FROM acct_ctrl.checklist_items ci
    JOIN acct_ctrl.work_items wi ON wi.checklist_template_id = ci.checklist_template_id
    WHERE wi.id = p_work_item_id AND ci.is_required
      AND NOT EXISTS (
        SELECT 1 FROM acct_ctrl.checklist_responses cr
        WHERE cr.work_item_id = wi.id AND cr.checklist_item_id = ci.id
          AND (NULLIF(BTRIM(cr.value), '') IS NOT NULL OR cr.file_id IS NOT NULL)
      );
    RETURN missing_count = 0;
  END IF;
  IF p_gate = 'evidence' THEN
    SELECT COUNT(*) INTO missing_count
    FROM acct_ctrl.evidence_requirements er
    WHERE er.work_item_id = p_work_item_id AND er.is_required
      AND NOT EXISTS (
        SELECT 1 FROM acct_ctrl.work_item_files wif
        JOIN acct_ctrl.files f ON f.id = wif.file_id
        WHERE wif.work_item_id = p_work_item_id
          AND wif.evidence_requirement_id = er.id
          AND f.checksum IS NOT NULL
          AND (er.max_size_mb IS NULL OR f.size_bytes <= er.max_size_mb * 1024 * 1024)
          AND (er.file_types IS NULL OR cardinality(er.file_types) = 0 OR lower(COALESCE(f.mime_type, '')) = ANY (SELECT lower(value) FROM unnest(er.file_types) value))
      );
    RETURN missing_count = 0;
  END IF;
  IF p_gate = 'children' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM acct_ctrl.work_items child
      WHERE child.parent_id = p_work_item_id AND child.deleted_at IS NULL AND NOT child.is_optional
        AND child.status NOT IN ('approved', 'completed')
    );
  END IF;
  IF p_gate = 'report_delivery' THEN
    RETURN EXISTS (
      SELECT 1 FROM acct_ctrl.work_items
      WHERE id = p_work_item_id AND type = 'report' AND report_stage = 'delivered' AND delivery_confirmed_at IS NOT NULL
    );
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.set_report_deliverable_stage(
  p_work_item_id UUID,
  p_stage TEXT,
  p_actor_id UUID,
  p_delivery_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  item acct_ctrl.work_items%ROWTYPE;
  allowed BOOLEAN;
BEGIN
  SELECT * INTO item FROM acct_ctrl.work_items WHERE id = p_work_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR item.type <> 'report' THEN RAISE EXCEPTION 'report tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships
    WHERE profile_id = p_actor_id AND organization_id = item.organization_id AND is_active
      AND role IN ('admin', 'owner', 'manager', 'finance_manager', 'accounting_manager')
  ) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'role tidak diizinkan' USING ERRCODE = '42501'; END IF;
  IF p_stage NOT IN ('draft', 'prepared', 'submitted', 'accepted', 'rejected', 'delivered') THEN RAISE EXCEPTION 'stage report tidak valid' USING ERRCODE = '22P02'; END IF;
  IF p_stage = 'delivered' AND NULLIF(BTRIM(p_delivery_reference), '') IS NULL THEN RAISE EXCEPTION 'referensi delivery wajib diisi' USING ERRCODE = '23514'; END IF;
  UPDATE acct_ctrl.work_items
  SET report_stage = p_stage,
      delivery_reference = CASE WHEN p_stage = 'delivered' THEN NULLIF(BTRIM(p_delivery_reference), '') ELSE delivery_reference END,
      delivery_confirmed_at = CASE WHEN p_stage = 'delivered' THEN now() ELSE delivery_confirmed_at END,
      updated_at = now()
  WHERE id = p_work_item_id;
  RETURN jsonb_build_object('id', p_work_item_id, 'report_stage', p_stage);
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.create_corrective_action_for_finding(
  p_finding_id UUID,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  finding acct_ctrl.audit_findings%ROWTYPE;
  sample acct_ctrl.audit_samples%ROWTYPE;
  item_id UUID;
  action_owner UUID;
BEGIN
  SELECT * INTO finding FROM acct_ctrl.audit_findings WHERE id = p_finding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'audit finding tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF lower(finding.severity) NOT IN ('major', 'critical') THEN RAISE EXCEPTION 'corrective action hanya untuk finding major atau critical' USING ERRCODE = '23514'; END IF;
  IF finding.corrective_task_id IS NOT NULL THEN RETURN finding.corrective_task_id; END IF;
  SELECT * INTO sample FROM acct_ctrl.audit_samples WHERE id = finding.audit_sample_id;
  action_owner := COALESCE(finding.owner_id, p_actor_id);
  INSERT INTO acct_ctrl.work_items (
    organization_id, client_id, type, title, description, acceptance_criteria,
    status, priority, risk_level, due_at, created_by
  )
  SELECT sample.organization_id, wi.client_id, 'ad_hoc',
    'Corrective action: ' || left(finding.description, 400),
    finding.description, 'Tindakan korektif selesai dan diverifikasi.',
    'assigned', CASE WHEN lower(finding.severity) = 'critical' THEN 'critical'::acct_ctrl.priority_level ELSE 'high'::acct_ctrl.priority_level END,
    CASE WHEN lower(finding.severity) = 'critical' THEN 'critical'::acct_ctrl.risk_level ELSE 'high'::acct_ctrl.risk_level END,
    COALESCE(finding.due_date::timestamptz, now() + interval '30 days'), p_actor_id
  FROM acct_ctrl.work_items wi WHERE wi.id = sample.work_item_id
  RETURNING id INTO item_id;
  INSERT INTO acct_ctrl.assignments (work_item_id, profile_id, role, assigned_by)
  VALUES (item_id, action_owner, 'maker', p_actor_id);
  UPDATE acct_ctrl.audit_findings SET corrective_task_id = item_id WHERE id = p_finding_id;
  RETURN item_id;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.set_report_deliverable_stage(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.set_report_deliverable_stage(UUID, TEXT, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION acct_ctrl.create_corrective_action_for_finding(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_corrective_action_for_finding(UUID, UUID) TO service_role;
