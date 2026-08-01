ALTER TABLE acct_ctrl.meetings ADD COLUMN IF NOT EXISTS draft_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_active_draft_key ON acct_ctrl.meetings(organization_id, created_by, draft_key) WHERE deleted_at IS NULL AND status = 'draft' AND draft_key IS NOT NULL;
