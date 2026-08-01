ALTER TABLE acct_ctrl.work_items
  ADD COLUMN IF NOT EXISTS progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_flag TEXT NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS is_rollup_parent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_explicit_delivery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_cycle INTEGER NOT NULL DEFAULT 0;

ALTER TABLE acct_ctrl.work_items
  ADD CONSTRAINT work_items_progress_percent_range CHECK (progress_percent >= 0 AND progress_percent <= 100),
  ADD CONSTRAINT work_items_health_flag_valid CHECK (health_flag IN ('on_track', 'at_risk', 'overdue', 'blocked')),
  ADD CONSTRAINT work_items_weight_positive CHECK (weight > 0);

CREATE INDEX IF NOT EXISTS idx_work_items_parent_status
  ON acct_ctrl.work_items(parent_id, status) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION acct_ctrl.validate_work_item_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  parent_org UUID;
  parent_client UUID;
  ancestor_id UUID;
  hierarchy_depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'work item tidak boleh menjadi parent dirinya sendiri' USING ERRCODE = '23514';
  END IF;

  SELECT organization_id, client_id INTO parent_org, parent_client
  FROM acct_ctrl.work_items WHERE id = NEW.parent_id AND deleted_at IS NULL;

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'parent work item tidak ditemukan' USING ERRCODE = '23503';
  END IF;
  IF parent_org <> NEW.organization_id OR parent_client <> NEW.client_id THEN
    RAISE EXCEPTION 'parent dan child harus berada pada organization dan client yang sama' USING ERRCODE = '23514';
  END IF;

  ancestor_id := NEW.parent_id;
  WHILE ancestor_id IS NOT NULL LOOP
    hierarchy_depth := hierarchy_depth + 1;
    IF hierarchy_depth > 2 THEN
      RAISE EXCEPTION 'hierarki work item maksimal 3 level' USING ERRCODE = '23514';
    END IF;
    SELECT parent_id INTO ancestor_id FROM acct_ctrl.work_items WHERE id = ancestor_id;
    IF ancestor_id = NEW.id THEN
      RAISE EXCEPTION 'siklus parent-child tidak diizinkan' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_work_item_hierarchy ON acct_ctrl.work_items;
CREATE TRIGGER trg_validate_work_item_hierarchy
  BEFORE INSERT OR UPDATE OF parent_id, organization_id, client_id ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_work_item_hierarchy();

CREATE OR REPLACE FUNCTION acct_ctrl.validate_assignment_separation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.unassigned_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role = 'maker' AND EXISTS (
    SELECT 1 FROM acct_ctrl.assignments WHERE work_item_id = NEW.work_item_id AND profile_id = NEW.profile_id AND role IN ('checker', 'approver') AND unassigned_at IS NULL AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'separation of duties dilanggar' USING ERRCODE = '23514';
  END IF;
  IF NEW.role = 'checker' AND EXISTS (
    SELECT 1 FROM acct_ctrl.assignments WHERE work_item_id = NEW.work_item_id AND profile_id = NEW.profile_id AND role IN ('maker', 'approver') AND unassigned_at IS NULL AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'separation of duties dilanggar' USING ERRCODE = '23514';
  END IF;
  IF NEW.role = 'approver' AND EXISTS (
    SELECT 1 FROM acct_ctrl.assignments WHERE work_item_id = NEW.work_item_id AND profile_id = NEW.profile_id AND role IN ('maker', 'checker') AND unassigned_at IS NULL AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'separation of duties dilanggar' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_assignment_separation ON acct_ctrl.assignments;
CREATE TRIGGER trg_validate_assignment_separation
  BEFORE INSERT OR UPDATE OF profile_id, role, unassigned_at ON acct_ctrl.assignments
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.validate_assignment_separation();

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
        WHERE wif.work_item_id = p_work_item_id AND wif.evidence_requirement_id = er.id
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
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.recalculate_parent_rollup(p_parent_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  total_weight NUMERIC;
  completed_weight NUMERIC;
  calculated_progress NUMERIC;
  next_health TEXT;
BEGIN
  SELECT COALESCE(SUM(weight), 0), COALESCE(SUM(weight) FILTER (WHERE status IN ('approved', 'completed')), 0)
  INTO total_weight, completed_weight
  FROM acct_ctrl.work_items WHERE parent_id = p_parent_id AND deleted_at IS NULL;
  IF total_weight = 0 THEN
    RETURN;
  END IF;
  calculated_progress := ROUND(completed_weight / total_weight * 100, 2);
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM acct_ctrl.work_items WHERE parent_id = p_parent_id AND deleted_at IS NULL AND status = 'blocked') THEN 'blocked'
    WHEN EXISTS (SELECT 1 FROM acct_ctrl.work_items WHERE parent_id = p_parent_id AND deleted_at IS NULL AND due_at < now() AND status NOT IN ('approved', 'completed', 'cancelled')) THEN 'overdue'
    WHEN EXISTS (SELECT 1 FROM acct_ctrl.work_items WHERE parent_id = p_parent_id AND deleted_at IS NULL AND health_flag = 'at_risk') THEN 'at_risk'
    ELSE 'on_track' END INTO next_health;
  UPDATE acct_ctrl.work_items
  SET progress_percent = calculated_progress,
      health_flag = next_health,
      updated_at = now()
  WHERE id = p_parent_id AND deleted_at IS NULL;
  IF acct_ctrl.work_item_gate(p_parent_id, 'children') THEN
    UPDATE acct_ctrl.work_items
    SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE id = p_parent_id AND status NOT IN ('completed', 'cancelled') AND is_rollup_parent;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.recalculate_parent_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      PERFORM acct_ctrl.recalculate_parent_rollup(OLD.parent_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    PERFORM acct_ctrl.recalculate_parent_rollup(NEW.parent_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS NOT NULL AND OLD.parent_id <> NEW.parent_id THEN
    PERFORM acct_ctrl.recalculate_parent_rollup(OLD.parent_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_parent_rollup ON acct_ctrl.work_items;
CREATE TRIGGER trg_recalculate_parent_rollup
  AFTER INSERT OR UPDATE OF status, weight, parent_id, due_at, health_flag OR DELETE ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.recalculate_parent_rollup_trigger();

CREATE OR REPLACE FUNCTION acct_ctrl.transition_work_item(
  p_work_item_id UUID,
  p_to_status acct_ctrl.work_item_status,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  item acct_ctrl.work_items%ROWTYPE;
  actor_role TEXT;
  is_admin BOOLEAN;
  now_value TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO item FROM acct_ctrl.work_items WHERE id = p_work_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work item tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  SELECT role INTO actor_role FROM acct_ctrl.assignments WHERE work_item_id = p_work_item_id AND profile_id = p_actor_id AND unassigned_at IS NULL LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM acct_ctrl.memberships WHERE profile_id = p_actor_id AND organization_id = item.organization_id AND is_active AND role IN ('admin', 'owner', 'accounting_manager')) INTO is_admin;
  IF p_to_status = item.status THEN RAISE EXCEPTION 'status work item tidak berubah' USING ERRCODE = '23514'; END IF;
  IF p_to_status IN ('blocked', 'revision_required', 'cancelled') AND NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'alasan wajib diisi' USING ERRCODE = '23514'; END IF;
  IF p_to_status = 'assigned' AND NOT (is_admin OR actor_role IS NOT NULL) THEN RAISE EXCEPTION 'role tidak diizinkan' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'in_progress' AND actor_role <> 'maker' THEN RAISE EXCEPTION 'hanya maker yang dapat memulai pekerjaan' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'submitted' THEN
    IF actor_role <> 'maker' THEN RAISE EXCEPTION 'hanya maker yang dapat submit' USING ERRCODE = '42501'; END IF;
    IF NOT acct_ctrl.work_item_gate(p_work_item_id, 'checklist') OR NOT acct_ctrl.work_item_gate(p_work_item_id, 'evidence') OR NOT acct_ctrl.work_item_gate(p_work_item_id, 'children') THEN RAISE EXCEPTION 'evidence, checklist, atau child wajib belum lengkap' USING ERRCODE = '23514'; END IF;
  END IF;
  IF p_to_status IN ('under_review', 'revision_required') AND actor_role <> 'checker' AND NOT is_admin THEN RAISE EXCEPTION 'hanya checker yang dapat melakukan review' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'approved' AND actor_role <> 'checker' AND NOT is_admin THEN RAISE EXCEPTION 'hanya checker yang dapat menyetujui review' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'revision_required' AND actor_role NOT IN ('checker', 'approver') AND NOT is_admin THEN RAISE EXCEPTION 'role tidak diizinkan meminta revisi' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'awaiting_approval' AND (item.risk_level NOT IN ('high', 'critical') OR item.status <> 'approved') THEN RAISE EXCEPTION 'approval tambahan hanya untuk risiko tinggi' USING ERRCODE = '23514'; END IF;
  IF p_to_status = 'completed' AND item.status = 'awaiting_approval' AND actor_role <> 'approver' AND NOT is_admin THEN RAISE EXCEPTION 'hanya approver yang dapat menyelesaikan approval' USING ERRCODE = '42501'; END IF;
  IF p_to_status = 'completed' AND item.status = 'approved' AND item.requires_explicit_delivery THEN RAISE EXCEPTION 'delivery evidence wajib sebelum selesai' USING ERRCODE = '23514'; END IF;
  IF p_to_status NOT IN ('cancelled', 'blocked', 'revision_required') AND item.status = 'draft' AND p_to_status <> 'assigned' THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'assigned' AND p_to_status NOT IN ('in_progress', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'in_progress' AND p_to_status NOT IN ('submitted', 'blocked', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'submitted' AND p_to_status NOT IN ('under_review', 'revision_required', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'under_review' AND p_to_status NOT IN ('approved', 'revision_required', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'revision_required' AND p_to_status NOT IN ('in_progress', 'submitted', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'approved' AND p_to_status NOT IN ('awaiting_approval', 'completed', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  IF item.status = 'awaiting_approval' AND p_to_status NOT IN ('completed', 'revision_required', 'cancelled') THEN RAISE EXCEPTION 'transisi status tidak valid' USING ERRCODE = '23514'; END IF;
  UPDATE acct_ctrl.work_items SET status = p_to_status, updated_at = now_value, completed_at = CASE WHEN p_to_status = 'completed' THEN now_value ELSE completed_at END, approval_cycle = CASE WHEN p_to_status = 'submitted' THEN approval_cycle + 1 ELSE approval_cycle END WHERE id = p_work_item_id;
  INSERT INTO acct_ctrl.work_item_status_history(work_item_id, from_status, to_status, changed_by, reason) VALUES (p_work_item_id, item.status, p_to_status, p_actor_id, NULLIF(BTRIM(p_reason), ''));
  IF item.parent_id IS NOT NULL THEN PERFORM acct_ctrl.recalculate_parent_rollup(item.parent_id); END IF;
  RETURN jsonb_build_object('id', p_work_item_id, 'from_status', item.status, 'to_status', p_to_status, 'approval_cycle', item.approval_cycle + CASE WHEN p_to_status = 'submitted' THEN 1 ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.transition_work_item(UUID, acct_ctrl.work_item_status, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.transition_work_item(UUID, acct_ctrl.work_item_status, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.record_review_decision(
  p_work_item_id UUID,
  p_actor_id UUID,
  p_kind TEXT,
  p_decision acct_ctrl.review_decision,
  p_comment TEXT DEFAULT NULL,
  p_checklist_template_id UUID DEFAULT NULL,
  p_findings JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  decision_id UUID;
  review_status acct_ctrl.work_item_status;
  item acct_ctrl.work_items%ROWTYPE;
  finding JSONB;
BEGIN
  SELECT * INTO item FROM acct_ctrl.work_items WHERE id = p_work_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work item tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF p_kind = 'review' THEN
    INSERT INTO acct_ctrl.reviews(work_item_id, reviewer_id, decision, comment, checklist_template_id)
    VALUES (p_work_item_id, p_actor_id, p_decision, NULLIF(BTRIM(p_comment), ''), p_checklist_template_id)
    RETURNING id INTO decision_id;
    FOR finding IN SELECT * FROM jsonb_array_elements(COALESCE(p_findings, '[]'::JSONB)) LOOP
      IF NULLIF(BTRIM(finding->>'description'), '') IS NOT NULL THEN
        INSERT INTO acct_ctrl.review_findings(review_id, checklist_item_id, finding_type, description, severity)
        VALUES (decision_id, NULLIF(finding->>'checklist_item_id', '')::UUID, COALESCE(finding->>'finding_type', 'observation'), BTRIM(finding->>'description'), NULLIF(finding->>'severity', ''));
      END IF;
    END LOOP;
    IF item.status = 'submitted' THEN
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'under_review', p_actor_id, NULL);
    END IF;
    IF p_decision = 'approved' THEN
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'approved', p_actor_id, NULL);
      IF item.risk_level IN ('high', 'critical') THEN
        PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'awaiting_approval', p_actor_id, NULL);
      ELSE
        PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'completed', p_actor_id, NULL);
      END IF;
    ELSE
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'revision_required', p_actor_id, COALESCE(p_comment, 'Review memerlukan revisi'));
    END IF;
  ELSIF p_kind = 'approval' THEN
    INSERT INTO acct_ctrl.approvals(work_item_id, approver_id, decision, comment)
    VALUES (p_work_item_id, p_actor_id, p_decision, NULLIF(BTRIM(p_comment), ''))
    RETURNING id INTO decision_id;
    IF p_decision = 'approved' THEN
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'completed', p_actor_id, NULL);
    ELSE
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'revision_required', p_actor_id, COALESCE(p_comment, 'Approval memerlukan revisi'));
    END IF;
  ELSE
    RAISE EXCEPTION 'jenis keputusan tidak valid' USING ERRCODE = '22P02';
  END IF;
  RETURN jsonb_build_object('id', decision_id, 'kind', p_kind, 'decision', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.record_review_decision(UUID, UUID, TEXT, acct_ctrl.review_decision, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.record_review_decision(UUID, UUID, TEXT, acct_ctrl.review_decision, TEXT, UUID, JSONB) TO service_role;
