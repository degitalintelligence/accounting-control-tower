CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_extraction_runs_message
  ON acct_ctrl.ai_extraction_runs(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_extraction_domain_event
  ON acct_ctrl.domain_events(event_type, aggregate_type, aggregate_id)
  WHERE event_type = 'ai_extraction_requested' AND aggregate_type = 'wa_message';

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_suggestions_extraction_title
  ON acct_ctrl.action_suggestions(extraction_run_id, suggested_title)
  WHERE extraction_run_id IS NOT NULL;
