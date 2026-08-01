CREATE TABLE acct_ctrl.notification_preferences (
  profile_id UUID PRIMARY KEY REFERENCES acct_ctrl.profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  email_on_assignment BOOLEAN NOT NULL DEFAULT true,
  email_on_status_change BOOLEAN NOT NULL DEFAULT true,
  email_on_deadline BOOLEAN NOT NULL DEFAULT true,
  email_on_overdue BOOLEAN NOT NULL DEFAULT true,
  email_on_review BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_ctrl.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_own" ON acct_ctrl.notification_preferences
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE UNIQUE INDEX idx_notification_deliveries_notification_channel
  ON acct_ctrl.notification_deliveries(notification_id, channel);
