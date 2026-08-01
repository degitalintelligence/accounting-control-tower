ALTER TABLE acct_ctrl.integration_connections
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES acct_ctrl.profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_provider_session
  ON acct_ctrl.integration_connections(provider, session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_groups_connection_active
  ON acct_ctrl.wa_groups(connection_id, is_active);

CREATE OR REPLACE FUNCTION acct_ctrl.retire_whatsapp_connection(
  p_connection_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
)
RETURNS acct_ctrl.integration_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
DECLARE
  retired_connection acct_ctrl.integration_connections;
BEGIN
  UPDATE acct_ctrl.integration_connections
  SET status = 'retired', retired_at = COALESCE(retired_at, now()), retired_by = COALESCE(retired_by, p_actor_id), updated_at = now()
  WHERE id = p_connection_id
    AND organization_id = p_organization_id
    AND status <> 'retired'
  RETURNING * INTO retired_connection;

  IF retired_connection.id IS NULL THEN
    SELECT * INTO retired_connection
    FROM acct_ctrl.integration_connections
    WHERE id = p_connection_id AND organization_id = p_organization_id;
    IF retired_connection.id IS NULL THEN
      RAISE EXCEPTION 'Connection tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    UPDATE acct_ctrl.wa_groups
    SET is_active = false, activated_by = NULL, activated_at = NULL
    WHERE connection_id = p_connection_id AND organization_id = p_organization_id;
  END IF;

  RETURN retired_connection;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.retire_whatsapp_connection(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.retire_whatsapp_connection(UUID, UUID, UUID) TO service_role;
