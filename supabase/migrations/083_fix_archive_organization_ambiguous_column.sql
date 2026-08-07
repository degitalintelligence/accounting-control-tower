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
  v_event_id UUID;
  v_sessions JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM acct_ctrl.memberships AS membership
    WHERE membership.profile_id = v_user_id
      AND membership.organization_id = p_organization_id
      AND membership.is_active = true
      AND membership.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM acct_ctrl.memberships AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.is_active = true
        AND membership.role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'SOLE_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM acct_ctrl.organizations AS organization
    WHERE organization.id = p_organization_id
      AND organization.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_ARCHIVED' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('connection_id', connection.id, 'session_id', connection.session_id)),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM acct_ctrl.integration_connections AS connection
  WHERE connection.organization_id = p_organization_id
    AND connection.provider = 'waha'
    AND connection.session_id IS NOT NULL
    AND connection.deleted_at IS NULL;

  INSERT INTO acct_ctrl.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, event_key, payload
  )
  VALUES (
    p_organization_id,
    'waha_session_cleanup_requested',
    'organization',
    p_organization_id,
    'organization.archive.waha_cleanup.' || p_organization_id::text,
    jsonb_build_object('organization_id', p_organization_id, 'sessions', v_sessions)
  )
  RETURNING id INTO v_event_id;

  INSERT INTO acct_ctrl.outbox_events (
    organization_id, domain_event_id, event_type, payload, max_retries
  )
  VALUES (
    p_organization_id, v_event_id, 'waha_session_cleanup_requested',
    jsonb_build_object('organization_id', p_organization_id, 'sessions', v_sessions), 12
  );

  UPDATE acct_ctrl.organizations AS organization
  SET deleted_at = coalesce(organization.deleted_at, v_archived_at), updated_at = v_archived_at
  WHERE organization.id = p_organization_id
    AND organization.deleted_at IS NULL;
  v_organization_updated := FOUND;

  UPDATE acct_ctrl.integration_connections AS connection
  SET status = 'retired',
      retired_at = COALESCE(connection.retired_at, v_archived_at),
      retired_by = COALESCE(connection.retired_by, v_user_id),
      updated_at = v_archived_at
  WHERE connection.organization_id = p_organization_id
    AND connection.provider = 'waha'
    AND connection.deleted_at IS NULL;

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
