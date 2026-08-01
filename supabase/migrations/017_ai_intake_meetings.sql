CREATE TABLE IF NOT EXISTS acct_ctrl.ai_intake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  filename TEXT,
  mime_type TEXT,
  source_text TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'file',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS acct_ctrl.ai_draft_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  intake_id UUID REFERENCES acct_ctrl.ai_intake_items(id),
  meeting_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'ad_hoc',
  client_id UUID REFERENCES acct_ctrl.clients(id),
  project_id UUID REFERENCES acct_ctrl.projects(id),
  maker_id UUID REFERENCES acct_ctrl.profiles(id),
  maker_name TEXT,
  due_at TIMESTAMPTZ,
  source_context TEXT,
  confidence NUMERIC(5,4),
  clarification_needed BOOLEAN NOT NULL DEFAULT true,
  clarification_question TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  confirmed_work_item_id UUID REFERENCES acct_ctrl.work_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS acct_ctrl.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  title TEXT NOT NULL,
  meeting_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE acct_ctrl.ai_draft_items ADD CONSTRAINT ai_draft_items_meeting_fk FOREIGN KEY (meeting_id) REFERENCES acct_ctrl.meetings(id);

ALTER TABLE acct_ctrl.ai_intake_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.ai_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_intake_org_access ON acct_ctrl.ai_intake_items FOR ALL USING (EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = ai_intake_items.organization_id AND m.profile_id = auth.uid() AND m.is_active));
CREATE POLICY ai_drafts_org_access ON acct_ctrl.ai_draft_items FOR ALL USING (EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = ai_draft_items.organization_id AND m.profile_id = auth.uid() AND m.is_active));
CREATE POLICY meetings_org_access ON acct_ctrl.meetings FOR ALL USING (EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = meetings.organization_id AND m.profile_id = auth.uid() AND m.is_active));

CREATE INDEX IF NOT EXISTS idx_ai_intake_org_status ON acct_ctrl.ai_intake_items(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_org_status ON acct_ctrl.ai_draft_items(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_org_date ON acct_ctrl.meetings(organization_id, meeting_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_meeting_status ON acct_ctrl.ai_draft_items(meeting_id, status, created_at DESC);

GRANT USAGE ON SCHEMA acct_ctrl TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.ai_intake_items, acct_ctrl.ai_draft_items, acct_ctrl.meetings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON acct_ctrl.ai_intake_items, acct_ctrl.ai_draft_items, acct_ctrl.meetings TO authenticated;
