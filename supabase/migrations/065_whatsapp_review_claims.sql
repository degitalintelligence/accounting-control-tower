ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES acct_ctrl.profiles(id),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

ALTER TABLE acct_ctrl.action_suggestions
  ADD CONSTRAINT action_suggestions_review_state_check
  CHECK (review_state IN ('unclaimed', 'claimed', 'needs_clarification'));

CREATE INDEX IF NOT EXISTS idx_action_suggestions_review_queue
  ON acct_ctrl.action_suggestions(organization_id, status, review_state, created_at DESC);

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
