CREATE TABLE acct_ctrl.ai_review_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  generated_by UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  reviewed_by UUID REFERENCES acct_ctrl.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  result JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_review_notes_work_item ON acct_ctrl.ai_review_notes(work_item_id, created_at DESC);
