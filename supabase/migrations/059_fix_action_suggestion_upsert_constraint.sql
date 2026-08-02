DROP INDEX IF EXISTS acct_ctrl.idx_action_suggestions_summary_title;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_suggestions_summary_title
  ON acct_ctrl.action_suggestions(source_summary_id, suggested_title);

GRANT SELECT, INSERT, UPDATE ON acct_ctrl.action_suggestions TO service_role;
