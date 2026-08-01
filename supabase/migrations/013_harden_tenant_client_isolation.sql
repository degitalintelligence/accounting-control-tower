CREATE OR REPLACE FUNCTION acct_ctrl.current_organization_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
  SELECT CASE WHEN COUNT(DISTINCT organization_id) = 1 THEN (ARRAY_AGG(DISTINCT organization_id))[1] ELSE NULL END
  FROM acct_ctrl.memberships
  WHERE profile_id = auth.uid()
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.has_client_access(target_organization_id UUID, target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM acct_ctrl.memberships
    WHERE profile_id = auth.uid()
      AND is_active = true
      AND organization_id = target_organization_id
      AND (client_id IS NULL OR client_id = target_client_id)
  );
$$;

REVOKE ALL ON FUNCTION acct_ctrl.current_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION acct_ctrl.has_client_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.current_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.has_client_access(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS org_isolation_clients ON acct_ctrl.clients;
CREATE POLICY org_client_isolation_clients ON acct_ctrl.clients
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, id));

DROP POLICY IF EXISTS org_isolation_entities ON acct_ctrl.entities;
CREATE POLICY org_client_isolation_entities ON acct_ctrl.entities
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_memberships ON acct_ctrl.memberships;
CREATE POLICY org_client_isolation_memberships ON acct_ctrl.memberships
  FOR ALL TO authenticated
  USING (organization_id = acct_ctrl.current_organization_id() AND (client_id IS NULL OR acct_ctrl.has_client_access(organization_id, client_id)))
  WITH CHECK (organization_id = acct_ctrl.current_organization_id() AND (client_id IS NULL OR acct_ctrl.has_client_access(organization_id, client_id)));

DROP POLICY IF EXISTS org_isolation_teams ON acct_ctrl.teams;
CREATE POLICY org_client_isolation_teams ON acct_ctrl.teams
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_sections ON acct_ctrl.sections;
CREATE POLICY org_client_isolation_sections ON acct_ctrl.sections
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_work_items ON acct_ctrl.work_items;
CREATE POLICY org_client_isolation_work_items ON acct_ctrl.work_items
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_task_templates ON acct_ctrl.task_templates;
CREATE POLICY org_client_isolation_task_templates ON acct_ctrl.task_templates
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_escalation_policies ON acct_ctrl.escalation_policies;
CREATE POLICY org_client_isolation_escalation_policies ON acct_ctrl.escalation_policies
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_wa_groups ON acct_ctrl.wa_groups;
CREATE POLICY org_client_isolation_wa_groups ON acct_ctrl.wa_groups
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));

DROP POLICY IF EXISTS org_isolation_action_suggestions ON acct_ctrl.action_suggestions;
CREATE POLICY org_client_isolation_action_suggestions ON acct_ctrl.action_suggestions
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, suggested_client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, suggested_client_id));
