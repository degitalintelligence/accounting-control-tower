CREATE OR REPLACE FUNCTION acct_ctrl.has_workspace_permission(target_organization_id UUID, target_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM acct_ctrl.memberships m
    JOIN acct_ctrl.role_permissions rp ON rp.role_id = m.role_id
    JOIN acct_ctrl.permission_catalog p ON p.id = rp.permission_id
    WHERE m.profile_id = auth.uid()
      AND m.organization_id = target_organization_id
      AND m.is_active = true
      AND p.permission_key = target_permission_key
  );
$$;

REVOKE ALL ON FUNCTION acct_ctrl.has_workspace_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.has_workspace_permission(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS organization_roles_access ON acct_ctrl.organization_roles;
DROP POLICY IF EXISTS role_permissions_access ON acct_ctrl.role_permissions;

CREATE POLICY organization_roles_select ON acct_ctrl.organization_roles
  FOR SELECT TO authenticated
  USING (organization_id = acct_ctrl.current_organization_id() AND deleted_at IS NULL);

CREATE POLICY organization_roles_insert ON acct_ctrl.organization_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = acct_ctrl.current_organization_id()
    AND is_system = false
    AND acct_ctrl.has_workspace_permission(organization_id, 'roles.manage')
  );

CREATE POLICY organization_roles_update ON acct_ctrl.organization_roles
  FOR UPDATE TO authenticated
  USING (
    organization_id = acct_ctrl.current_organization_id()
    AND is_system = false
    AND acct_ctrl.has_workspace_permission(organization_id, 'roles.manage')
  )
  WITH CHECK (
    organization_id = acct_ctrl.current_organization_id()
    AND is_system = false
    AND acct_ctrl.has_workspace_permission(organization_id, 'roles.manage')
  );

CREATE POLICY organization_roles_delete ON acct_ctrl.organization_roles
  FOR DELETE TO authenticated
  USING (
    organization_id = acct_ctrl.current_organization_id()
    AND is_system = false
    AND acct_ctrl.has_workspace_permission(organization_id, 'roles.manage')
  );

CREATE POLICY role_permissions_select ON acct_ctrl.role_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM acct_ctrl.organization_roles r
    WHERE r.id = role_permissions.role_id
      AND r.organization_id = acct_ctrl.current_organization_id()
      AND r.deleted_at IS NULL
  ));

CREATE POLICY role_permissions_insert ON acct_ctrl.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM acct_ctrl.organization_roles r
    WHERE r.id = role_permissions.role_id
      AND r.organization_id = acct_ctrl.current_organization_id()
      AND r.deleted_at IS NULL
      AND r.is_system = false
      AND acct_ctrl.has_workspace_permission(r.organization_id, 'roles.manage')
  ));

CREATE POLICY role_permissions_delete ON acct_ctrl.role_permissions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM acct_ctrl.organization_roles r
    WHERE r.id = role_permissions.role_id
      AND r.organization_id = acct_ctrl.current_organization_id()
      AND r.deleted_at IS NULL
      AND r.is_system = false
      AND acct_ctrl.has_workspace_permission(r.organization_id, 'roles.manage')
  ));

REVOKE INSERT, UPDATE, DELETE ON acct_ctrl.permission_catalog FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON acct_ctrl.organization_roles FROM authenticated;
REVOKE INSERT, DELETE ON acct_ctrl.role_permissions FROM authenticated;
GRANT SELECT ON acct_ctrl.permission_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.organization_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON acct_ctrl.role_permissions TO authenticated;
