DROP INDEX IF EXISTS acct_ctrl.idx_action_suggestions_extraction_title;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_suggestions_extraction_title
  ON acct_ctrl.action_suggestions(extraction_run_id, suggested_title);

GRANT SELECT, INSERT, UPDATE ON acct_ctrl.action_suggestions TO service_role;
