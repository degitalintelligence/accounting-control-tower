ALTER TABLE acct_ctrl.milestones
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE acct_ctrl.checklist_templates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE acct_ctrl.checklist_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_milestones_project_active
  ON acct_ctrl.milestones(project_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_org_active_deleted
  ON acct_ctrl.checklist_templates(organization_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_template_active
  ON acct_ctrl.checklist_items(checklist_template_id, sort_order)
  WHERE deleted_at IS NULL;
