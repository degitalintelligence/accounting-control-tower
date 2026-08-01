ALTER TABLE acct_ctrl.work_items
  ADD COLUMN checklist_template_id UUID REFERENCES acct_ctrl.checklist_templates(id);

ALTER TABLE acct_ctrl.checklist_templates
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE acct_ctrl.checklist_responses
  ADD CONSTRAINT checklist_responses_unique_assignment
  UNIQUE (work_item_id, checklist_item_id, profile_id);

CREATE INDEX idx_checklist_templates_org_active
  ON acct_ctrl.checklist_templates(organization_id, is_active);

CREATE INDEX idx_checklist_items_template_order
  ON acct_ctrl.checklist_items(checklist_template_id, sort_order);

CREATE INDEX idx_checklist_responses_work_item
  ON acct_ctrl.checklist_responses(work_item_id);
