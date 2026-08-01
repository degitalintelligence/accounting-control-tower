DROP INDEX IF EXISTS acct_ctrl.idx_notifications_dedup_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_profile_dedup_key
  ON acct_ctrl.notifications(profile_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
