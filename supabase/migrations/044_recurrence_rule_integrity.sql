CREATE UNIQUE INDEX IF NOT EXISTS idx_recurrence_rules_active_template
  ON acct_ctrl.recurrence_rules(template_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_template_versions_effective_selection
  ON acct_ctrl.template_versions(template_id, effective_from DESC, version_number DESC);
