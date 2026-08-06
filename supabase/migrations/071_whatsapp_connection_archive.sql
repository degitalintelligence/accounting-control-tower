ALTER TABLE acct_ctrl.integration_connections
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES acct_ctrl.profiles(id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_organization_visible
  ON acct_ctrl.integration_connections(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION acct_ctrl.archive_retired_whatsapp_connection(
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
  archived_connection acct_ctrl.integration_connections;
BEGIN
  UPDATE acct_ctrl.integration_connections
  SET status = 'retired',
      retired_at = COALESCE(retired_at, now()),
      retired_by = COALESCE(retired_by, p_actor_id),
      deleted_at = COALESCE(deleted_at, now()),
      deleted_by = COALESCE(deleted_by, p_actor_id),
      updated_at = now()
  WHERE id = p_connection_id
    AND organization_id = p_organization_id
    AND status = 'retired'
    AND deleted_at IS NULL
  RETURNING * INTO archived_connection;

  IF archived_connection.id IS NULL THEN
    SELECT * INTO archived_connection
    FROM acct_ctrl.integration_connections
    WHERE id = p_connection_id AND organization_id = p_organization_id;
    IF archived_connection.id IS NULL THEN
      RAISE EXCEPTION 'Connection tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    IF archived_connection.status <> 'retired' THEN
      RAISE EXCEPTION 'Connection harus retired sebelum dihapus dari daftar.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN archived_connection;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.archive_retired_whatsapp_connection(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.archive_retired_whatsapp_connection(UUID, UUID, UUID) TO service_role;
