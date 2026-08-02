GRANT USAGE ON SCHEMA acct_ctrl TO service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE acct_ctrl.whatsapp_conversation_summaries
TO service_role;
