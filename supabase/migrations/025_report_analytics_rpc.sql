CREATE OR REPLACE FUNCTION acct_ctrl.report_analytics(
  p_organization_id UUID,
  p_client_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  total BIGINT,
  completed BIGINT,
  active BIGINT,
  overdue BIGINT,
  delivered BIGINT,
  pending_delivery BIGINT,
  on_time_rate NUMERIC,
  lifecycle JSONB,
  versions JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
  WITH scoped AS (
    SELECT wi.*
    FROM acct_ctrl.work_items wi
    WHERE wi.organization_id = p_organization_id
      AND wi.type = 'report'
      AND wi.deleted_at IS NULL
      AND (p_client_ids IS NULL OR wi.client_id = ANY(p_client_ids))
  ), lifecycle_rows AS (
    SELECT report_stage, COUNT(*)::BIGINT AS total
    FROM scoped
    GROUP BY report_stage
  ), version_rows AS (
    SELECT COALESCE(wi.template_version_id::TEXT, 'tanpa versi') AS version,
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE wi.status = 'completed')::BIGINT AS completed
    FROM scoped wi
    GROUP BY COALESCE(wi.template_version_id::TEXT, 'tanpa versi')
  )
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'draft'))::BIGINT,
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'draft') AND due_at < now())::BIGINT,
    COUNT(*) FILTER (WHERE report_stage = 'delivered')::BIGINT,
    COUNT(*) FILTER (WHERE report_stage <> 'delivered' AND status NOT IN ('cancelled', 'draft'))::BIGINT,
    COALESCE(ROUND(100 * COUNT(*) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND due_at IS NOT NULL AND completed_at <= due_at)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND due_at IS NOT NULL), 0), 0), 0),
    COALESCE((SELECT jsonb_object_agg(report_stage, total) FROM lifecycle_rows), '{}'::JSONB),
    COALESCE((SELECT jsonb_object_agg(version, jsonb_build_object('total', total, 'completed', completed)) FROM version_rows), '{}'::JSONB)
  FROM scoped;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.report_analytics(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.report_analytics(UUID, UUID[]) TO service_role;
