ALTER TABLE acct_ctrl.planned_leaves ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE OR REPLACE FUNCTION acct_ctrl.approve_planned_leave(p_leave_id UUID, p_actor_id UUID)
RETURNS acct_ctrl.planned_leaves LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE item acct_ctrl.planned_leaves%ROWTYPE; result acct_ctrl.planned_leaves%ROWTYPE;
BEGIN
  SELECT * INTO item FROM acct_ctrl.planned_leaves WHERE id = p_leave_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planned leave tidak ditemukan'; END IF;
  IF item.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_PLANNED_LEAVE_TRANSITION'; END IF;
  IF item.created_by = p_actor_id THEN RAISE EXCEPTION 'Self approval tidak diizinkan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = item.organization_id AND m.profile_id = p_actor_id AND m.is_active AND m.role IN ('admin','manager','finance_manager','accounting_manager')) THEN RAISE EXCEPTION 'Aktor tidak memiliki hak approval'; END IF;
  IF EXISTS (SELECT 1 FROM acct_ctrl.planned_leaves other WHERE other.organization_id = item.organization_id AND other.profile_id = item.profile_id AND other.id <> item.id AND other.status = 'approved' AND other.deleted_at IS NULL AND other.start_date <= item.end_date AND other.end_date >= item.start_date) THEN RAISE EXCEPTION 'PLANNED_LEAVE_OVERLAP'; END IF;
  UPDATE acct_ctrl.planned_leaves SET status='approved', approved_by=p_actor_id, approved_at=now(), updated_at=now(), rejection_reason=NULL WHERE id=item.id RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.reject_planned_leave(p_leave_id UUID, p_actor_id UUID, p_reason TEXT)
RETURNS acct_ctrl.planned_leaves LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE item acct_ctrl.planned_leaves%ROWTYPE; result acct_ctrl.planned_leaves%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'Alasan penolakan wajib diisi'; END IF;
  SELECT * INTO item FROM acct_ctrl.planned_leaves WHERE id=p_leave_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planned leave tidak ditemukan'; END IF;
  IF item.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_PLANNED_LEAVE_TRANSITION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id=item.organization_id AND m.profile_id=p_actor_id AND m.is_active AND m.role IN ('admin','manager','finance_manager','accounting_manager')) THEN RAISE EXCEPTION 'Aktor tidak memiliki hak approval'; END IF;
  UPDATE acct_ctrl.planned_leaves SET status='rejected', rejection_reason=btrim(p_reason), updated_at=now() WHERE id=item.id RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.cancel_planned_leave(p_leave_id UUID, p_actor_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS acct_ctrl.planned_leaves LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE item acct_ctrl.planned_leaves%ROWTYPE; result acct_ctrl.planned_leaves%ROWTYPE;
BEGIN
  SELECT * INTO item FROM acct_ctrl.planned_leaves WHERE id=p_leave_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planned leave tidak ditemukan'; END IF;
  IF item.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'INVALID_PLANNED_LEAVE_TRANSITION'; END IF;
  IF item.created_by <> p_actor_id AND NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id=item.organization_id AND m.profile_id=p_actor_id AND m.is_active AND m.role IN ('admin','manager','finance_manager','accounting_manager')) THEN RAISE EXCEPTION 'Tidak memiliki hak membatalkan planned leave'; END IF;
  IF item.status = 'approved' AND btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan leave approved wajib diisi'; END IF;
  UPDATE acct_ctrl.planned_leaves SET status='cancelled', rejection_reason=CASE WHEN item.status='approved' THEN btrim(p_reason) ELSE rejection_reason END, updated_at=now() WHERE id=item.id RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.approve_planned_leave(UUID,UUID), acct_ctrl.reject_planned_leave(UUID,UUID,TEXT), acct_ctrl.cancel_planned_leave(UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.approve_planned_leave(UUID,UUID), acct_ctrl.reject_planned_leave(UUID,UUID,TEXT), acct_ctrl.cancel_planned_leave(UUID,UUID,TEXT) TO service_role;
