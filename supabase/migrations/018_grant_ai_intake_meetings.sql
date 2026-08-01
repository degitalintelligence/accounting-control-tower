GRANT USAGE ON SCHEMA acct_ctrl TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.ai_intake_items, acct_ctrl.ai_draft_items, acct_ctrl.meetings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.ai_intake_items, acct_ctrl.ai_draft_items, acct_ctrl.meetings TO authenticated;
