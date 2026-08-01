ALTER TABLE acct_ctrl.domain_events
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_event_key
  ON acct_ctrl.domain_events(event_key)
  WHERE event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_instances_policy_item
  ON acct_ctrl.escalation_instances(policy_id, work_item_id)
;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_events_domain_event
  ON acct_ctrl.outbox_events(domain_event_id)
  WHERE domain_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_key
  ON acct_ctrl.notifications(dedup_key)
  WHERE dedup_key IS NOT NULL;
