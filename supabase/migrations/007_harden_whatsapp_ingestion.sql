ALTER TABLE acct_ctrl.wa_messages
  ALTER COLUMN provider_message_id SET NOT NULL;

ALTER TABLE acct_ctrl.wa_messages
  ADD CONSTRAINT wa_messages_provider_message_id_not_blank
  CHECK (btrim(provider_message_id) <> '');

ALTER TABLE acct_ctrl.wa_messages
  ADD CONSTRAINT wa_messages_group_required
  CHECK (wa_group_id IS NOT NULL);

ALTER TABLE acct_ctrl.ai_extraction_runs
  ADD CONSTRAINT ai_extraction_runs_confidence_range
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);

ALTER TABLE acct_ctrl.action_suggestions
  ADD CONSTRAINT action_suggestions_confidence_range
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);

ALTER TABLE acct_ctrl.action_suggestions
  ADD CONSTRAINT action_suggestions_confirmed_fields
  CHECK (
    status <> 'confirmed'
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND created_work_item_id IS NOT NULL)
  );

ALTER TABLE acct_ctrl.action_suggestions
  ADD CONSTRAINT action_suggestions_rejected_reason
  CHECK (status <> 'rejected' OR NULLIF(btrim(rejected_reason), '') IS NOT NULL);

ALTER TABLE acct_ctrl.dead_letter_events
  ADD CONSTRAINT dead_letter_events_retry_count_nonnegative
  CHECK (retry_count >= 0);

CREATE INDEX idx_wa_messages_connection_received
  ON acct_ctrl.wa_messages(connection_id, received_at DESC);

CREATE INDEX idx_wa_messages_group_received
  ON acct_ctrl.wa_messages(wa_group_id, received_at DESC);

CREATE INDEX idx_ai_extraction_runs_message_created
  ON acct_ctrl.ai_extraction_runs(wa_message_id, created_at DESC);

CREATE INDEX idx_action_suggestions_org_pending
  ON acct_ctrl.action_suggestions(organization_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX idx_dead_letter_events_retry
  ON acct_ctrl.dead_letter_events(event_type, retry_count, created_at);
