GRANT USAGE ON SCHEMA acct_ctrl TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE acct_ctrl.ai_policies
TO authenticated, service_role;
