CREATE OR REPLACE FUNCTION acct_ctrl.archive_organization(p_organization_id UUID)
RETURNS TABLE(organization_id UUID, archived_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_archived_at TIMESTAMPTZ := now();
  v_organization_updated BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM acct_ctrl.memberships AS membership
    WHERE membership.profile_id = v_user_id
      AND membership.organization_id = p_organization_id
      AND membership.is_active = true
      AND membership.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM acct_ctrl.memberships
      WHERE organization_id = p_organization_id AND is_active = true AND role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'SOLE_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE organizations
  SET deleted_at = coalesce(deleted_at, v_archived_at), updated_at = v_archived_at
  WHERE id = p_organization_id AND deleted_at IS NULL;
  v_organization_updated := FOUND;

  UPDATE acct_ctrl.integration_connections
  SET status = 'retired',
      retired_at = COALESCE(retired_at, v_archived_at),
      retired_by = COALESCE(retired_by, v_user_id),
      updated_at = v_archived_at
  WHERE organization_id = p_organization_id
    AND provider = 'waha'
    AND deleted_at IS NULL;

  IF NOT v_organization_updated THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_ARCHIVED' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO acct_ctrl.audit_logs (organization_id, actor_id, action, entity_type, entity_id, new_value)
  VALUES (p_organization_id, v_user_id, 'organization.archived', 'organization', p_organization_id,
          jsonb_build_object('archived_at', v_archived_at, 'data_retained', true));

  RETURN QUERY SELECT p_organization_id, v_archived_at;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.archive_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.archive_organization(UUID) TO authenticated;
