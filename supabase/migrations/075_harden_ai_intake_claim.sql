ALTER TABLE acct_ctrl.ai_intake_items
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_intake_claim_lease
ON acct_ctrl.ai_intake_items(status, lease_expires_at, queued_at, created_at);

CREATE OR REPLACE FUNCTION acct_ctrl.claim_ai_intake(
  p_intake_id UUID,
  p_organization_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 600
)
RETURNS SETOF acct_ctrl.ai_intake_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE acct_ctrl.ai_intake_items
  SET status = 'processing',
      processing_started_at = now(),
      attempt_count = COALESCE(attempt_count, 0) + 1,
      claimed_by = p_worker_id,
      claim_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      updated_at = now()
  WHERE id = p_intake_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (
      status = 'queued'
      OR (
        status = 'processing'
        AND (
          lease_expires_at IS NULL
          OR lease_expires_at <= now()
        )
      )
    )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.recover_expired_ai_intakes(
  p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH expired AS (
    SELECT id
    FROM acct_ctrl.ai_intake_items
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= now()
    ORDER BY lease_expires_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE acct_ctrl.ai_intake_items intake
  SET status = 'queued',
      queued_at = now(),
      claimed_by = NULL,
      claim_token = NULL,
      lease_expires_at = NULL,
      error_message = 'Worker lease AI intake kedaluwarsa.',
      updated_at = now()
  FROM expired
  WHERE intake.id = expired.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_ai_intake(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION acct_ctrl.recover_expired_ai_intakes(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_ai_intake(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION acct_ctrl.recover_expired_ai_intakes(INTEGER) TO service_role;
