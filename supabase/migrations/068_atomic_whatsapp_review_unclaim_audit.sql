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
DECLARE
  released_id UUID;
BEGIN
  UPDATE acct_ctrl.action_suggestions AS suggestion_row
  SET review_state = 'unclaimed', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL, updated_at = now()
  WHERE suggestion_row.id = p_suggestion_id
    AND suggestion_row.organization_id = p_organization_id
    AND suggestion_row.status = 'pending'
    AND suggestion_row.claimed_by = p_released_by
  RETURNING suggestion_row.id INTO released_id;

  IF released_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO acct_ctrl.audit_logs (organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_organization_id, p_released_by, 'wa_suggestion.unclaimed', 'action_suggestion', released_id,
    jsonb_build_object('review_state', 'claimed', 'claimed_by', p_released_by),
    jsonb_build_object('review_state', 'unclaimed'));

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.release_action_suggestion_claim(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.release_action_suggestion_claim(UUID, UUID, UUID) TO service_role;
