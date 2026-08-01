ALTER TABLE acct_ctrl.ai_review_notes
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES acct_ctrl.clients(id);

UPDATE acct_ctrl.ai_review_notes n
SET client_id = wi.client_id
FROM acct_ctrl.work_items wi
WHERE wi.id = n.work_item_id
  AND n.client_id IS NULL;

ALTER TABLE acct_ctrl.ai_review_notes
  ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE acct_ctrl.audit_findings
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES acct_ctrl.clients(id);

UPDATE acct_ctrl.audit_findings f
SET client_id = wi.client_id
FROM acct_ctrl.audit_samples s
JOIN acct_ctrl.work_items wi ON wi.id = s.work_item_id
WHERE s.id = f.audit_sample_id
  AND f.client_id IS NULL;

ALTER TABLE acct_ctrl.audit_findings
  ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_review_notes_client
  ON acct_ctrl.ai_review_notes(organization_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_findings_client
  ON acct_ctrl.audit_findings(client_id, created_at DESC);

CREATE OR REPLACE FUNCTION acct_ctrl.validate_file_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  item_org UUID;
  item_client UUID;
  file_org UUID;
  file_path TEXT;
BEGIN
  SELECT wi.organization_id, wi.client_id INTO item_org, item_client
  FROM acct_ctrl.work_items wi
  WHERE wi.id = NEW.work_item_id AND wi.deleted_at IS NULL;
  SELECT f.organization_id, f.storage_path INTO file_org, file_path
  FROM acct_ctrl.files f
  WHERE f.id = NEW.file_id;
  IF item_org IS NULL OR file_org IS NULL OR item_org <> file_org THEN
    RAISE EXCEPTION 'file dan work item tidak berada pada organisasi yang sama' USING ERRCODE = '23514';
  END IF;
  IF split_part(file_path, '/', 1) <> item_org::TEXT
     OR split_part(file_path, '/', 2) <> NEW.work_item_id::TEXT THEN
    RAISE EXCEPTION 'storage_path tidak memiliki ownership work item yang valid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_file_ownership ON acct_ctrl.work_item_files;
CREATE TRIGGER trg_validate_file_ownership
  BEFORE INSERT OR UPDATE OF work_item_id, file_id ON acct_ctrl.work_item_files
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_file_ownership();

CREATE OR REPLACE FUNCTION acct_ctrl.protect_locked_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_locked THEN
    RAISE EXCEPTION 'evidence terkunci tidak dapat dihapus' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_locked THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.filename IS DISTINCT FROM OLD.filename
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.checksum IS DISTINCT FROM OLD.checksum
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
      RAISE EXCEPTION 'evidence terkunci tidak dapat dimutasi' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION 'storage_path tidak dapat dimutasi' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_file ON acct_ctrl.files;
CREATE TRIGGER trg_protect_locked_file
  BEFORE UPDATE OR DELETE ON acct_ctrl.files
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.protect_locked_file();

CREATE OR REPLACE FUNCTION acct_ctrl.validate_report_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.type = 'report' AND NEW.status = 'completed'
     AND (NEW.report_stage <> 'delivered' OR NEW.delivery_confirmed_at IS NULL OR NULLIF(BTRIM(NEW.delivery_reference), '') IS NULL) THEN
    RAISE EXCEPTION 'report harus delivered dengan delivery completion sebelum completed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_completion ON acct_ctrl.work_items;
CREATE TRIGGER trg_validate_report_completion
  BEFORE INSERT OR UPDATE OF status, report_stage, delivery_confirmed_at, delivery_reference ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_report_completion();

CREATE OR REPLACE FUNCTION acct_ctrl.validate_report_stage_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.type = 'report' AND NEW.report_stage IS DISTINCT FROM OLD.report_stage
     AND NOT (
       (OLD.report_stage = 'draft' AND NEW.report_stage IN ('prepared', 'rejected')) OR
       (OLD.report_stage = 'prepared' AND NEW.report_stage IN ('submitted', 'rejected')) OR
       (OLD.report_stage = 'submitted' AND NEW.report_stage IN ('accepted', 'rejected')) OR
       (OLD.report_stage = 'accepted' AND NEW.report_stage = 'delivered') OR
       (OLD.report_stage = 'rejected' AND NEW.report_stage IN ('prepared', 'submitted')) OR
       (OLD.report_stage = 'delivered' AND NEW.report_stage = 'delivered')
     ) THEN
    RAISE EXCEPTION 'transisi stage report tidak valid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_stage_transition ON acct_ctrl.work_items;
CREATE TRIGGER trg_validate_report_stage_transition
  BEFORE UPDATE OF report_stage ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_report_stage_transition();

CREATE OR REPLACE FUNCTION acct_ctrl.sync_scoped_control_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  item_client UUID;
BEGIN
  SELECT wi.client_id INTO item_client
  FROM acct_ctrl.audit_samples s
  JOIN acct_ctrl.work_items wi ON wi.id = s.work_item_id
  WHERE s.id = NEW.audit_sample_id;
  IF item_client IS NULL OR NEW.client_id IS DISTINCT FROM item_client THEN
    RAISE EXCEPTION 'scope client control tidak valid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_audit_finding_scope ON acct_ctrl.audit_findings;
CREATE TRIGGER trg_sync_audit_finding_scope
  BEFORE INSERT OR UPDATE OF audit_sample_id, client_id ON acct_ctrl.audit_findings
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.sync_scoped_control_ownership();

CREATE OR REPLACE FUNCTION acct_ctrl.sync_ai_review_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  item_client UUID;
BEGIN
  SELECT client_id INTO item_client FROM acct_ctrl.work_items WHERE id = NEW.work_item_id;
  IF item_client IS NULL OR NEW.client_id IS DISTINCT FROM item_client THEN
    RAISE EXCEPTION 'scope client AI review tidak valid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ai_review_scope ON acct_ctrl.ai_review_notes;
CREATE TRIGGER trg_sync_ai_review_scope
  BEFORE INSERT OR UPDATE OF work_item_id, client_id ON acct_ctrl.ai_review_notes
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.sync_ai_review_scope();
