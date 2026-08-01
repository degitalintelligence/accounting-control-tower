CREATE INDEX IF NOT EXISTS idx_status_history_kpi
  ON acct_ctrl.work_item_status_history(work_item_id, to_status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_kpi
  ON acct_ctrl.reviews(work_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_samples_kpi
  ON acct_ctrl.audit_samples(organization_id, sampled_at, work_item_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_kpi
  ON acct_ctrl.audit_logs(organization_id, entity_type, entity_id, action, created_at);

CREATE OR REPLACE FUNCTION acct_ctrl.dashboard_kpi_analytics(
  p_organization_id UUID,
  p_client_ids UUID[] DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_include_rollups BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  first_pass_approval_rate NUMERIC,
  first_pass_approved BIGINT,
  reviewed_items BIGINT,
  average_review_hours NUMERIC,
  reviewed_items_with_duration BIGINT,
  overdue_aging JSONB,
  sop_compliance_rate NUMERIC,
  sop_samples_audited BIGINT,
  sop_samples_compliant BIGINT,
  autonomous_completion_rate NUMERIC,
  autonomous_completed BIGINT,
  eligible_completed BIGINT,
  manager_intervention_count BIGINT
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
      AND wi.deleted_at IS NULL
      AND (p_client_ids IS NULL OR wi.client_id = ANY(p_client_ids))
      AND (p_from IS NULL OR COALESCE(wi.completed_at, wi.created_at) >= p_from)
      AND (p_to IS NULL OR COALESCE(wi.completed_at, wi.created_at) < p_to)
      AND (p_include_rollups OR NOT wi.is_rollup_parent)
  ),
  first_reviews AS (
    SELECT DISTINCT ON (r.work_item_id)
      r.work_item_id, r.decision, r.created_at
    FROM acct_ctrl.reviews r
    JOIN scoped wi ON wi.id = r.work_item_id
    WHERE r.decision IS NOT NULL
    ORDER BY r.work_item_id, r.created_at
  ),
  submission_times AS (
    SELECT h.work_item_id, MIN(h.created_at) AS submitted_at
    FROM acct_ctrl.work_item_status_history h
    JOIN scoped wi ON wi.id = h.work_item_id
    WHERE h.to_status = 'submitted'
    GROUP BY h.work_item_id
  ),
  review_durations AS (
    SELECT fr.work_item_id, EXTRACT(EPOCH FROM (fr.created_at - st.submitted_at)) / 3600 AS hours
    FROM first_reviews fr
    JOIN submission_times st ON st.work_item_id = fr.work_item_id
    WHERE fr.created_at >= st.submitted_at
  ),
  overdue AS (
    SELECT jsonb_build_array(
      jsonb_build_object('bucket', '1_3', 'label', '1–3 hari', 'count', COUNT(*) FILTER (WHERE age_days BETWEEN 1 AND 3), 'weight', COALESCE(SUM(weight) FILTER (WHERE age_days BETWEEN 1 AND 3), 0)),
      jsonb_build_object('bucket', '4_7', 'label', '4–7 hari', 'count', COUNT(*) FILTER (WHERE age_days BETWEEN 4 AND 7), 'weight', COALESCE(SUM(weight) FILTER (WHERE age_days BETWEEN 4 AND 7), 0)),
      jsonb_build_object('bucket', '8_14', 'label', '8–14 hari', 'count', COUNT(*) FILTER (WHERE age_days BETWEEN 8 AND 14), 'weight', COALESCE(SUM(weight) FILTER (WHERE age_days BETWEEN 8 AND 14), 0)),
      jsonb_build_object('bucket', '15_30', 'label', '15–30 hari', 'count', COUNT(*) FILTER (WHERE age_days BETWEEN 15 AND 30), 'weight', COALESCE(SUM(weight) FILTER (WHERE age_days BETWEEN 15 AND 30), 0)),
      jsonb_build_object('bucket', '30_plus', 'label', '>30 hari', 'count', COUNT(*) FILTER (WHERE age_days > 30), 'weight', COALESCE(SUM(weight) FILTER (WHERE age_days > 30), 0))
    ) AS data
    FROM (
      SELECT wi.weight, FLOOR(EXTRACT(EPOCH FROM (now() - wi.due_at)) / 86400)::INTEGER AS age_days
      FROM scoped wi
      WHERE wi.due_at < now() AND wi.status NOT IN ('completed', 'cancelled', 'draft')
    ) rows
  ),
  samples AS (
    SELECT a.*
    FROM acct_ctrl.audit_samples a
    JOIN scoped wi ON wi.id = a.work_item_id
    WHERE (p_from IS NULL OR a.sampled_at >= p_from) AND (p_to IS NULL OR a.sampled_at < p_to)
  ),
  interventions AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM acct_ctrl.audit_logs al
    JOIN scoped wi ON wi.id = al.entity_id
    WHERE al.entity_type = 'work_item'
      AND al.action IN ('override_status', 'manual_reassignment', 'change_due_date', 'manual_escalation')
  ),
  eligible AS (
    SELECT wi.* FROM scoped wi
    WHERE wi.status = 'completed' AND wi.completed_at IS NOT NULL
  )
  SELECT
    COALESCE(ROUND(100 * (SELECT COUNT(*) FROM first_reviews WHERE decision = 'approved')::NUMERIC / NULLIF((SELECT COUNT(*) FROM first_reviews), 0), 2), 0),
    (SELECT COUNT(*) FROM first_reviews WHERE decision = 'approved'),
    (SELECT COUNT(*) FROM first_reviews),
    COALESCE(ROUND((SELECT AVG(hours) FROM review_durations), 2), 0),
    (SELECT COUNT(*) FROM review_durations),
    (SELECT data FROM overdue),
    COALESCE(ROUND(100 * (SELECT COUNT(*) FROM samples WHERE lower(COALESCE(rating, '')) IN ('compliant', 'pass', 'passed'))::NUMERIC / NULLIF((SELECT COUNT(*) FROM samples), 0), 2), 0),
    (SELECT COUNT(*) FROM samples),
    (SELECT COUNT(*) FROM samples WHERE lower(COALESCE(rating, '')) IN ('compliant', 'pass', 'passed')),
    COALESCE(ROUND(100 * (SELECT COUNT(*) FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM acct_ctrl.audit_logs al WHERE al.entity_type = 'work_item' AND al.entity_id = e.id AND al.action IN ('override_status', 'manual_reassignment', 'change_due_date', 'manual_escalation')))::NUMERIC / NULLIF((SELECT COUNT(*) FROM eligible), 0), 2), 0),
    (SELECT COUNT(*) FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM acct_ctrl.audit_logs al WHERE al.entity_type = 'work_item' AND al.entity_id = e.id AND al.action IN ('override_status', 'manual_reassignment', 'change_due_date', 'manual_escalation'))),
    (SELECT COUNT(*) FROM eligible),
    (SELECT total FROM interventions);
$$;

REVOKE ALL ON FUNCTION acct_ctrl.dashboard_kpi_analytics(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.dashboard_kpi_analytics(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;
