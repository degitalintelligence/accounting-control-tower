-- Fix: trg_reject_archived_work_items menempel di work_items/recurrence_job_runs
-- (tabel TANPA kolom event_type), tapi fungsi mereferensikan NEW.event_type dalam
-- satu ekspresi boolean (082). Akibatnya insert work item / project gagal 42703
-- "record \"new\" has no field \"event_type\"".
--
-- Solusi: referensikan NEW.event_type hanya di dalam cabang IF bersarang
-- (TG_TABLE_NAME = domain_events/outbox_events yang punya kolom tsb), sehingga
-- tidak pernah dievaluasi untuk tabel lain.
CREATE OR REPLACE FUNCTION acct_ctrl.reject_archived_organization_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  v_org_archived BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM acct_ctrl.organizations
    WHERE id = NEW.organization_id
      AND deleted_at IS NOT NULL
  ) INTO v_org_archived;

  IF NOT v_org_archived THEN
    RETURN NEW;
  END IF;

  -- Satu-satunya automation durable yang diizinkan setelah archive: cleanup sesi WAHA.
  -- NEW.event_type hanya eksis di domain_events & outbox_events, jadi hanya diakses
  -- di cabang ini; tabel lain (work_items, recurrence_job_runs) tanpa kolom tsb.
  IF TG_TABLE_NAME IN ('domain_events', 'outbox_events') THEN
    IF NEW.event_type = 'waha_session_cleanup_requested' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Organisasi telah diarsipkan; automation tidak diizinkan' USING ERRCODE = 'P0001';
END;
$$;
