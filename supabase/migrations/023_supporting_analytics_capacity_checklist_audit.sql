ALTER TABLE acct_ctrl.profiles
  ADD COLUMN IF NOT EXISTS capacity_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_active_work_items INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS workload_timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta';

ALTER TABLE acct_ctrl.checklist_items
  ADD CONSTRAINT checklist_items_input_type_check
  CHECK (input_type IN ('checkbox', 'text', 'number', 'date', 'file', 'url', 'confirmation'));

CREATE INDEX IF NOT EXISTS idx_work_items_analytics_org_status_due
  ON acct_ctrl.work_items(organization_id, status, due_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION acct_ctrl.dashboard_analytics(p_organization_id UUID)
RETURNS TABLE (
  critical_overdue BIGINT,
  waiting_review BIGINT,
  blocked BIGINT,
  total_completed BIGINT,
  total_items BIGINT,
  on_time_rate NUMERIC,
  average_cycle_hours NUMERIC,
  revision_rate NUMERIC,
  high_risk_open BIGINT,
  overdue_weight NUMERIC,
  audit_coverage_rate NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
  WITH scoped AS (
    SELECT wi.*
    FROM acct_ctrl.work_items wi
    WHERE wi.organization_id = p_organization_id
      AND wi.deleted_at IS NULL
  ), sampled AS (
    SELECT COUNT(DISTINCT a.work_item_id)::NUMERIC AS sampled_count
    FROM acct_ctrl.audit_samples a
    JOIN scoped wi ON wi.id = a.work_item_id
  ), eligible AS (
    SELECT COUNT(*)::NUMERIC AS eligible_count
    FROM scoped
    WHERE status = 'completed'
      AND completed_at IS NOT NULL
      AND risk_level IN ('high', 'critical')
  )
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'draft') AND due_at < now()),
    COUNT(*) FILTER (WHERE status = 'under_review'),
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'draft')),
    COALESCE(ROUND(100 * COUNT(*) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND due_at IS NOT NULL AND completed_at <= due_at)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND due_at IS NOT NULL), 0), 0), 0),
    COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL))::NUMERIC, 2), 0),
    COALESCE(ROUND(100 * COUNT(*) FILTER (WHERE status = 'revision_required')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'draft')), 0), 2), 0),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'draft') AND risk_level IN ('high', 'critical')),
    COALESCE(SUM(weight) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'draft') AND due_at < now()), 0),
    COALESCE(ROUND(100 * MAX(sampled.sampled_count) / NULLIF(MAX(eligible.eligible_count), 0), 2), 0)
  FROM scoped, sampled, eligible;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.auto_sample_audits(p_organization_id UUID, p_auditor_id UUID, p_sample_size INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  target_count INTEGER;
  inserted_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships
    WHERE organization_id = p_organization_id AND profile_id = p_auditor_id AND client_id IS NULL AND is_active
  ) THEN
    RAISE EXCEPTION 'Auditor tidak memiliki akses organisasi';
  END IF;
  IF p_sample_size IS NOT NULL AND p_sample_size < 1 THEN
    RAISE EXCEPTION 'Ukuran sample harus positif';
  END IF;
  SELECT COALESCE(p_sample_size, GREATEST(1, CEIL(COUNT(*) * 0.05)::INTEGER)) INTO target_count
  FROM work_items wi
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND status = 'completed'
    AND risk_level IN ('high', 'critical');

  INSERT INTO audit_samples (organization_id, auditor_id, work_item_id, notes)
  SELECT p_organization_id, p_auditor_id, wi.id, 'Auto-sampled berdasarkan risk dan coverage minimum.'
  FROM work_items wi
  WHERE wi.organization_id = p_organization_id
    AND wi.deleted_at IS NULL
    AND wi.status = 'completed'
    AND wi.risk_level IN ('high', 'critical')
    AND NOT EXISTS (SELECT 1 FROM audit_samples a WHERE a.work_item_id = wi.id)
  ORDER BY wi.completed_at DESC NULLS LAST, wi.id
  LIMIT target_count;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.dashboard_analytics(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.auto_sample_audits(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.dashboard_analytics(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.auto_sample_audits(UUID, UUID, INTEGER) TO service_role;
