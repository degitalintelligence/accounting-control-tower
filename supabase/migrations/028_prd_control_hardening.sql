ALTER TABLE acct_ctrl.files
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scanner_name TEXT,
  ADD COLUMN IF NOT EXISTS scan_error TEXT;

ALTER TABLE acct_ctrl.files
  DROP CONSTRAINT IF EXISTS files_scan_status_valid;

ALTER TABLE acct_ctrl.files
  ADD CONSTRAINT files_scan_status_valid CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed'));

CREATE OR REPLACE FUNCTION acct_ctrl.work_item_completion_gate(p_work_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  RETURN acct_ctrl.work_item_gate(p_work_item_id, 'children');
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.validate_parent_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.status = 'completed'
    AND EXISTS (
      SELECT 1
      FROM acct_ctrl.work_items child
      WHERE child.parent_id = NEW.id
        AND child.deleted_at IS NULL
        AND NOT child.is_optional
        AND child.status NOT IN ('approved', 'completed')
    ) THEN
    RAISE EXCEPTION 'mandatory child work item belum selesai' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_parent_completion ON acct_ctrl.work_items;
CREATE TRIGGER trg_validate_parent_completion
  BEFORE UPDATE OF status ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_parent_completion();

CREATE OR REPLACE FUNCTION acct_ctrl.validate_evidence_scan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.scan_status = 'clean' AND NEW.scanned_at IS NULL THEN
    RAISE EXCEPTION 'file clean wajib memiliki waktu scan' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_evidence_scan ON acct_ctrl.files;
CREATE TRIGGER trg_validate_evidence_scan
  BEFORE INSERT OR UPDATE OF scan_status, scanned_at ON acct_ctrl.files
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_evidence_scan();

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
          AND f.scan_status = 'clean'
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
