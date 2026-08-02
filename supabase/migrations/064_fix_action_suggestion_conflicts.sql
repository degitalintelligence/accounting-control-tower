DROP INDEX IF EXISTS acct_ctrl.idx_action_suggestions_extraction_title;
DROP INDEX IF EXISTS acct_ctrl.idx_action_suggestions_summary_title;

CREATE UNIQUE INDEX idx_action_suggestions_extraction_title
  ON acct_ctrl.action_suggestions(extraction_run_id, suggested_title);

CREATE UNIQUE INDEX idx_action_suggestions_summary_title
  ON acct_ctrl.action_suggestions(source_summary_id, suggested_title);

GRANT SELECT, INSERT, UPDATE ON acct_ctrl.action_suggestions TO service_role;
