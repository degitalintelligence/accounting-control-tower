DROP POLICY IF EXISTS org_client_isolation_memberships ON acct_ctrl.memberships;
DROP POLICY IF EXISTS memberships_select_current_organization ON acct_ctrl.memberships;
DROP POLICY IF EXISTS memberships_insert_server_only ON acct_ctrl.memberships;
DROP POLICY IF EXISTS memberships_update_server_only ON acct_ctrl.memberships;
DROP POLICY IF EXISTS memberships_delete_server_only ON acct_ctrl.memberships;

CREATE POLICY memberships_select_current_organization ON acct_ctrl.memberships
  FOR SELECT TO authenticated
  USING (organization_id = acct_ctrl.current_organization_id());

CREATE POLICY memberships_insert_server_only ON acct_ctrl.memberships
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY memberships_update_server_only ON acct_ctrl.memberships
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY memberships_delete_server_only ON acct_ctrl.memberships
  FOR DELETE TO authenticated
  USING (false);
