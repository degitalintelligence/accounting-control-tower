CREATE OR REPLACE FUNCTION acct_ctrl.dashboard_analytics(
  p_organization_id UUID,
  p_client_ids UUID[] DEFAULT NULL
)
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
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
  WITH scoped AS (
    SELECT
      wi.id,
      wi.status,
      wi.risk_level,
      wi.due_at,
      wi.completed_at,
      wi.created_at,
      wi.weight
    FROM acct_ctrl.work_items wi
    WHERE wi.organization_id = p_organization_id
      AND wi.deleted_at IS NULL
      AND (p_client_ids IS NULL OR wi.client_id = ANY(p_client_ids))
  ), sampled AS (
    SELECT COUNT(DISTINCT a.work_item_id)::NUMERIC AS sampled_count
    FROM acct_ctrl.audit_samples a
    JOIN scoped wi ON wi.id = a.work_item_id
  ), eligible AS (
    SELECT COUNT(*)::NUMERIC AS eligible_count
    FROM scoped
    WHERE status = 'completed'::acct_ctrl.work_item_status
      AND completed_at IS NOT NULL
      AND risk_level IN ('high'::acct_ctrl.risk_level, 'critical'::acct_ctrl.risk_level)
  )
  SELECT
    COUNT(*) FILTER (
      WHERE status NOT IN (
        'completed'::acct_ctrl.work_item_status,
        'cancelled'::acct_ctrl.work_item_status,
        'draft'::acct_ctrl.work_item_status
      )
      AND due_at < now()
    ),
    COUNT(*) FILTER (WHERE status = 'under_review'::acct_ctrl.work_item_status),
    COUNT(*) FILTER (WHERE status = 'blocked'::acct_ctrl.work_item_status),
    COUNT(*) FILTER (WHERE status = 'completed'::acct_ctrl.work_item_status),
    COUNT(*) FILTER (
      WHERE status NOT IN (
        'cancelled'::acct_ctrl.work_item_status,
        'draft'::acct_ctrl.work_item_status
      )
    ),
    COALESCE(
      ROUND(
        100 * COUNT(*) FILTER (
          WHERE status = 'completed'::acct_ctrl.work_item_status
            AND completed_at IS NOT NULL
            AND due_at IS NOT NULL
            AND completed_at <= due_at
        )::NUMERIC
        / NULLIF(
            COUNT(*) FILTER (
              WHERE status = 'completed'::acct_ctrl.work_item_status
                AND completed_at IS NOT NULL
                AND due_at IS NOT NULL
            ),
            0
          ),
        0
      ),
      0
    ),
    COALESCE(
      ROUND(
        (
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600)
          FILTER (
            WHERE status = 'completed'::acct_ctrl.work_item_status
              AND completed_at IS NOT NULL
          )
        )::NUMERIC,
        2
      ),
      0
    ),
    COALESCE(
      ROUND(
        100 * COUNT(*) FILTER (
          WHERE status = 'revision_required'::acct_ctrl.work_item_status
        )::NUMERIC
        / NULLIF(
            COUNT(*) FILTER (
              WHERE status NOT IN (
                'cancelled'::acct_ctrl.work_item_status,
                'draft'::acct_ctrl.work_item_status
              )
            ),
            0
          ),
        2
      ),
      0
    ),
    COUNT(*) FILTER (
      WHERE status NOT IN (
        'completed'::acct_ctrl.work_item_status,
        'cancelled'::acct_ctrl.work_item_status,
        'draft'::acct_ctrl.work_item_status
      )
      AND risk_level IN ('high'::acct_ctrl.risk_level, 'critical'::acct_ctrl.risk_level)
    ),
    COALESCE(
      SUM(weight) FILTER (
        WHERE status NOT IN (
          'completed'::acct_ctrl.work_item_status,
          'cancelled'::acct_ctrl.work_item_status,
          'draft'::acct_ctrl.work_item_status
        )
        AND due_at < now()
      ),
      0
    ),
    COALESCE(
      ROUND(
        100 * MAX(sampled.sampled_count)
        / NULLIF(MAX(eligible.eligible_count), 0),
        2
      ),
      0
    )
  FROM scoped, sampled, eligible;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.dashboard_analytics(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.dashboard_analytics(UUID, UUID[]) TO service_role;
