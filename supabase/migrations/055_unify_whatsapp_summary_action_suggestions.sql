ALTER TABLE acct_ctrl.action_suggestions
  ADD COLUMN IF NOT EXISTS source_summary_id UUID REFERENCES acct_ctrl.whatsapp_conversation_summaries(id),
  ADD COLUMN IF NOT EXISTS evidence_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_text TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_suggestions_summary_title
  ON acct_ctrl.action_suggestions(source_summary_id, suggested_title)
  WHERE source_summary_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_suggestions_summary
  ON acct_ctrl.action_suggestions(organization_id, source_summary_id)
  WHERE source_summary_id IS NOT NULL;
