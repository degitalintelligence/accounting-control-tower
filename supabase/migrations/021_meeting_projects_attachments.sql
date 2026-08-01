ALTER TABLE acct_ctrl.meetings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES acct_ctrl.projects(id);

CREATE TABLE IF NOT EXISTS acct_ctrl.meeting_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  meeting_id UUID NOT NULL REFERENCES acct_ctrl.meetings(id),
  file_name TEXT NOT NULL,
  mime_type TEXT,
  source_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE acct_ctrl.meeting_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_attachments_org_access ON acct_ctrl.meeting_attachments FOR ALL USING (EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = meeting_attachments.organization_id AND m.profile_id = auth.uid() AND m.is_active));
CREATE INDEX IF NOT EXISTS idx_meetings_project ON acct_ctrl.meetings(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attachments_meeting ON acct_ctrl.meeting_attachments(meeting_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.meeting_attachments TO service_role, authenticated;
