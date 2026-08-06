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
  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships AS membership_row
    WHERE membership_row.organization_id = p_organization_id
      AND membership_row.profile_id = p_claimed_by
      AND membership_row.is_active
  ) THEN
    RAISE EXCEPTION 'Reviewer tidak memiliki membership aktif';
  END IF;

  UPDATE acct_ctrl.action_suggestions AS suggestion_row
  SET review_state = 'claimed',
      claimed_by = p_claimed_by,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(mins => duration_minutes),
      updated_at = now()
  WHERE suggestion_row.id = p_suggestion_id
    AND suggestion_row.organization_id = p_organization_id
    AND suggestion_row.status = 'pending'
    AND (suggestion_row.review_state = 'unclaimed'
      OR suggestion_row.claim_expires_at IS NULL
      OR suggestion_row.claim_expires_at <= now()
      OR suggestion_row.claimed_by = p_claimed_by)
  RETURNING suggestion_row.* INTO claimed;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion sedang direview user lain atau sudah diproses';
  END IF;

  RETURN QUERY
  SELECT claimed.id, claimed.review_state, claimed.claimed_by, claimed.claimed_at, claimed.claim_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.claim_action_suggestion(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.claim_action_suggestion(UUID, UUID, UUID, INTEGER) TO service_role;
