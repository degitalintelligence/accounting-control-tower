CREATE INDEX IF NOT EXISTS idx_memberships_profile_active
  ON acct_ctrl.memberships(profile_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_work_items_org_created_active
  ON acct_ctrl.work_items(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_org_due_active
  ON acct_ctrl.work_items(organization_id, due_at)
  WHERE deleted_at IS NULL AND due_at IS NOT NULL AND status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_milestones_project_order
  ON acct_ctrl.milestones(project_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_feed
  ON acct_ctrl.notifications(organization_id, profile_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_suggestions_org_created
  ON acct_ctrl.action_suggestions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON acct_ctrl.audit_logs(organization_id, created_at DESC);
