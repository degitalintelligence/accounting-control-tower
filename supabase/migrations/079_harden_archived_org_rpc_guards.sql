-- Harden remaining RPC functions with explicit archived-organization guards.
-- Migration 078 added triggers for work_items, domain_events, outbox_events,
-- and recurrence_job_runs. This migration covers RPCs that mutate tables
-- without those triggers (planned_leaves, action_suggestions,
-- integration_connections, ai_intake_items) so archived organizations are
-- rejected early in the function body.

-- 1. Planned leave workflow — guard on org archived
CREATE OR REPLACE FUNCTION acct_ctrl.approve_planned_leave(p_leave_id UUID, p_actor_id UUID)
RETURNS acct_ctrl.planned_leaves LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE item acct_ctrl.planned_leaves%ROWTYPE; result acct_ctrl.planned_leaves%ROWTYPE;
BEGIN
  SELECT * INTO item FROM acct_ctrl.planned_leaves WHERE id = p_leave_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planned leave tidak ditemukan'; END IF;
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = item.organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
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
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = item.organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
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
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = item.organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  IF item.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'INVALID_PLANNED_LEAVE_TRANSITION'; END IF;
  IF item.created_by <> p_actor_id AND NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id=item.organization_id AND m.profile_id=p_actor_id AND m.is_active AND m.role IN ('admin','manager','finance_manager','accounting_manager')) THEN RAISE EXCEPTION 'Tidak memiliki hak membatalkan planned leave'; END IF;
  IF item.status = 'approved' AND btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan leave approved wajib diisi'; END IF;
  UPDATE acct_ctrl.planned_leaves SET status='cancelled', rejection_reason=CASE WHEN item.status='approved' THEN btrim(p_reason) ELSE rejection_reason END, updated_at=now() WHERE id=item.id RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.approve_planned_leave(UUID,UUID), acct_ctrl.reject_planned_leave(UUID,UUID,TEXT), acct_ctrl.cancel_planned_leave(UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.approve_planned_leave(UUID,UUID), acct_ctrl.reject_planned_leave(UUID,UUID,TEXT), acct_ctrl.cancel_planned_leave(UUID,UUID,TEXT) TO service_role;

-- 2. Action suggestion claim — guard on org archived
CREATE OR REPLACE FUNCTION acct_ctrl.claim_action_suggestion(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_claimed_by UUID,
  p_claim_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(id UUID, review_state TEXT, claimed_by UUID, claimed_at TIMESTAMPTZ, claim_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  claimed acct_ctrl.action_suggestions%ROWTYPE;
  duration_minutes INTEGER := LEAST(GREATEST(COALESCE(p_claim_duration_minutes, 30), 5), 120);
BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = p_organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships
    WHERE organization_id = p_organization_id AND profile_id = p_claimed_by AND is_active
  ) THEN
    RAISE EXCEPTION 'Reviewer tidak memiliki membership aktif';
  END IF;

  UPDATE acct_ctrl.action_suggestions
  SET review_state = 'claimed', claimed_by = p_claimed_by, claimed_at = now(),
      claim_expires_at = now() + make_interval(mins => duration_minutes), updated_at = now()
  WHERE action_suggestions.id = p_suggestion_id
    AND organization_id = p_organization_id
    AND status = 'pending'
    AND (review_state = 'unclaimed' OR claim_expires_at IS NULL OR claim_expires_at <= now() OR claimed_by = p_claimed_by)
  RETURNING action_suggestions.* INTO claimed;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion sedang direview user lain atau sudah diproses';
  END IF;

  RETURN QUERY SELECT claimed.id, claimed.review_state, claimed.claimed_by, claimed.claimed_at, claimed.claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.release_action_suggestion_claim(
  p_suggestion_id UUID,
  p_organization_id UUID,
  p_released_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = p_organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  UPDATE acct_ctrl.action_suggestions
  SET review_state = 'unclaimed', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL, updated_at = now()
  WHERE id = p_suggestion_id AND organization_id = p_organization_id AND status = 'pending' AND claimed_by = p_released_by;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_action_suggestion(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION acct_ctrl.release_action_suggestion_claim(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_action_suggestion(UUID, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.release_action_suggestion_claim(UUID, UUID, UUID) TO service_role;

-- 3. WhatsApp connection retirement — guard on org archived
CREATE OR REPLACE FUNCTION acct_ctrl.retire_whatsapp_connection(
  p_connection_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
)
RETURNS acct_ctrl.integration_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  retired_connection acct_ctrl.integration_connections;
BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = p_organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  UPDATE acct_ctrl.integration_connections
  SET status = 'retired', retired_at = COALESCE(retired_at, now()), retired_by = COALESCE(retired_by, p_actor_id), updated_at = now()
  WHERE id = p_connection_id
    AND organization_id = p_organization_id
    AND status <> 'retired'
  RETURNING * INTO retired_connection;

  IF retired_connection.id IS NULL THEN
    SELECT * INTO retired_connection
    FROM acct_ctrl.integration_connections
    WHERE id = p_connection_id AND organization_id = p_organization_id;
    IF retired_connection.id IS NULL THEN
      RAISE EXCEPTION 'Connection tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    UPDATE acct_ctrl.wa_groups
    SET is_active = false, activated_by = NULL, activated_at = NULL
    WHERE connection_id = p_connection_id AND organization_id = p_organization_id;
  END IF;

  RETURN retired_connection;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.archive_retired_whatsapp_connection(
  p_connection_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
)
RETURNS acct_ctrl.integration_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  archived_connection acct_ctrl.integration_connections;
BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = p_organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  UPDATE acct_ctrl.integration_connections
  SET status = 'retired',
      retired_at = COALESCE(retired_at, now()),
      retired_by = COALESCE(retired_by, p_actor_id),
      deleted_at = COALESCE(deleted_at, now()),
      deleted_by = COALESCE(deleted_by, p_actor_id),
      updated_at = now()
  WHERE id = p_connection_id
    AND organization_id = p_organization_id
    AND status = 'retired'
    AND deleted_at IS NULL
  RETURNING * INTO archived_connection;

  IF archived_connection.id IS NULL THEN
    SELECT * INTO archived_connection
    FROM acct_ctrl.integration_connections
    WHERE id = p_connection_id AND organization_id = p_organization_id;
    IF archived_connection.id IS NULL THEN
      RAISE EXCEPTION 'Connection tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    IF archived_connection.status <> 'retired' THEN
      RAISE EXCEPTION 'Connection harus retired sebelum dihapus dari daftar.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN archived_connection;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.retire_whatsapp_connection(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.retire_whatsapp_connection(UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION acct_ctrl.archive_retired_whatsapp_connection(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.archive_retired_whatsapp_connection(UUID, UUID, UUID) TO service_role;

-- 4. AI intake enqueue — defense-in-depth guard on org archived
CREATE OR REPLACE FUNCTION acct_ctrl.enqueue_ai_intake(p_intake_id UUID, p_organization_id UUID, p_created_by UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE intake acct_ctrl.ai_intake_items%ROWTYPE; event_id UUID; outbox_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM acct_ctrl.organizations WHERE id = p_organization_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; operasi tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO intake FROM acct_ctrl.ai_intake_items WHERE id = p_intake_id AND organization_id = p_organization_id AND created_by = p_created_by AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI intake tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF intake.status NOT IN ('pending','failed') THEN RETURN jsonb_build_object('intake_id', intake.id, 'status', intake.status); END IF;
  UPDATE acct_ctrl.ai_intake_items SET status = 'queued', queued_at = now(), failed_at = NULL, error_message = NULL, updated_at = now() WHERE id = intake.id;
  INSERT INTO acct_ctrl.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES (p_organization_id, 'ai_intake_requested', 'ai_intake', intake.id, jsonb_build_object('intake_id', intake.id, 'organization_id', p_organization_id, 'created_by', p_created_by)) RETURNING id INTO event_id;
  INSERT INTO acct_ctrl.outbox_events(organization_id, domain_event_id, event_type, payload, max_retries) VALUES (p_organization_id, event_id, 'ai_intake_requested', jsonb_build_object('intake_id', intake.id, 'organization_id', p_organization_id), 5) RETURNING id INTO outbox_id;
  RETURN jsonb_build_object('intake_id', intake.id, 'status', 'queued', 'outbox_id', outbox_id);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.enqueue_ai_intake(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.enqueue_ai_intake(UUID,UUID,UUID) TO service_role;
